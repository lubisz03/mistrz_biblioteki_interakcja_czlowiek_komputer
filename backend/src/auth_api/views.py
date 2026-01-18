from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, ParseError
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import (
    BlacklistedToken,
    OutstandingToken,
    RefreshToken,
)
from django.conf import settings
from rest_framework_simplejwt.views import TokenRefreshView
from mail.mail_service import Email
from .authenticate import CustomAuthentication
from .exceptions import UserNotActive
from .permissions import AllowUnauthenticated
from .serializers import (
    ChangeEmailSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    LogoutSerializer,
    PasswordResetRequestSerializer,
    CookieTokenRefreshSerializer,
    PasswordResetSerializer,
    RegistrationSerializer,
    UserSerializer,
    UserUpdateSerializer,
    VerifySerializer,
)
from .utils import (
    authenticate_user,
    delete_cookies,
    get_user_tokens,
    set_cookies,
)

User = get_user_model()


class LoginView(APIView):
    serializer_class = LoginSerializer
    permission_classes = [AllowUnauthenticated]
    authentication_classes = []

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except Exception as e:
            print(e)

        login = serializer.validated_data.get("login", None)
        password = serializer.validated_data.get("password", None)
        remember_me = serializer.validated_data.get("remember_me", False)

        if not login or not password:
            raise AuthenticationFailed("Email or Password is incorrect!")

        try:
            res = authenticate_user(request, login, password, remember_me)
            if res is not None:
                return res
        except UserNotActive:
            return Response(
                {"message": "Account is inactive"}, status=status.HTTP_403_FORBIDDEN
            )

        raise AuthenticationFailed("Email or Password is incorrect!")


class RegistrationView(APIView):
    serializer_class = RegistrationSerializer
    permission_classes = [AllowUnauthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data)
        if serializer.is_valid():
            user = serializer.save()

            login = serializer.validated_data["email"]
            password = serializer.validated_data["password"]

            res = authenticate_user(request, login, password)
            if res is not None:
                res.status_code = status.HTTP_201_CREATED
                return res
            return Response(
                UserSerializer(user).data, status=status.HTTP_401_UNAUTHORIZED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CookieTokenRefreshView(TokenRefreshView):
    serializer_class = CookieTokenRefreshSerializer

    def finalize_response(self, request, response, *args, **kwargs):
        if response.data.get("refresh") and response.data.get("access"):
            set_cookies(
                response,
                {
                    "access_token": response.data["access"],
                    "refresh_token": response.data["refresh"],
                },
            )

            response.data["access_token"] = response.data["access"]
            del response.data["access"]
            del response.data["refresh"]

        response["X-CSRFToken"] = request.COOKIES.get("csrftoken")
        return super().finalize_response(request, response, *args, **kwargs)


class CustomTokenVerifyView(APIView):
    authentication_classes = []
    permission_classes = []
    serializer_class = VerifySerializer

    def post(self, request, *args, **kwargs):
        auth = CustomAuthentication()

        response_data = {
            "valid": False,
            "message": "",
        }
        res_status = status.HTTP_401_UNAUTHORIZED

        try:
            user, _ = auth.authenticate(request)
            res_status = None

            if user:
                response_data["valid"] = True
                response_data["message"] = "Token is valid"
                res_status = status.HTTP_200_OK
                serializer = UserSerializer(user)
                response_data["user"] = serializer.data
            else:
                response_data["message"] = "Token is invalid"

            serializer = self.serializer_class(response_data)
            return Response(serializer.data, status=res_status)
        except Exception as e:
            serializer = self.serializer_class(response_data)
            return Response(serializer.data, status=res_status)


class WebSocketTokenView(APIView):
    """
    Endpoint zwracający token JWT dla WebSocket.
    Token jest pobierany z cookies (HttpOnly) i zwracany w odpowiedzi.
    """
    permission_classes = [IsAuthenticated]
    authentication_classes = [CustomAuthentication]

    def get(self, request):
        """Zwróć token JWT z cookies dla WebSocket"""
        token = request.COOKIES.get(settings.SIMPLE_JWT["AUTH_COOKIE"])

        if not token:
            return Response(
                {"error": "No token found in cookies"},
                status=status.HTTP_401_UNAUTHORIZED
            )

        return Response({
            "token": token,
            "message": "Token retrieved successfully"
        })


class LogoutView(APIView):
    serializer_class = LogoutSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            tokens = get_user_tokens(request.user)
            refresh_token = tokens["refresh_token"]
            if not refresh_token:
                raise ParseError("No refresh token found")

            token = RefreshToken(refresh_token)
            token.blacklist()
            res_data = {"message": "Successfully logged out"}

            res = Response(self.serializer_class(res_data).data)
            res = delete_cookies(res)
            return res

        except Exception as e:
            raise ParseError(f"Invalid token: {str(e)}")


class LogoutAllView(APIView):
    serializer_class = LogoutSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tokens = OutstandingToken.objects.filter(user_id=request.user.id)
        for token in tokens:
            t, _ = BlacklistedToken.objects.get_or_create(token=token)

        res_data = {"message": "Successfully logged out"}

        res = Response(self.serializer_class(res_data).data)
        res = delete_cookies(res)
        return res


class UserDetailsView(RetrieveUpdateAPIView):
    serializer_class = UserUpdateSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data["email"]
            user = User.objects.get(email=email)

            token = default_token_generator.make_token(user)
            uid = user.pk
            reset_url = f"{settings.FRONTEND_URL}/new-password/{uid}/{token}/"

            Email(user.email).send(
                Email.reset_password,
                {
                    "name": user.first_name if user.first_name else user.username,
                    "reset_link": reset_url,
                    "site_domain": settings.SITE_DOMAIN,
                },
            )

            return Response(
                {"detail": "Password reset link sent."},
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, uidb64, token, *args, **kwargs):
        try:
            user = User.objects.get(pk=uidb64)
        except (ValueError, TypeError, User.DoesNotExist):
            return Response(
                {"detail": "Invalid user or token."}, status=status.HTTP_400_BAD_REQUEST
            )

        if not default_token_generator.check_token(user, token):
            return Response(
                {"detail": "Invalid or expired token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PasswordResetSerializer(data=request.data)
        if serializer.is_valid():
            new_password = serializer.validated_data["new_password"]
            user.set_password(new_password)
            if not user.is_active:
                user.is_active = True
            user.save()

            return Response(
                {"detail": "Password reset successfully."}, status=status.HTTP_200_OK
            )
        return Response(serializer.errors, status=status.HTTP_406_NOT_ACCEPTABLE)


class ChangeEmailView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangeEmailSerializer(data=request.data)
        if serializer.is_valid():
            request.user.email = serializer.validated_data["new_email"]
            request.user.save()
            return Response(
                {"message": "Email updated successfully"}, status=status.HTTP_200_OK
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )

        if serializer.is_valid():
            serializer.save()
            return Response(
                {"message": "Password updated successfully"}, status=status.HTTP_200_OK
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DeleteUserView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        user = request.user
        user.delete()
        return Response(
            {"message": "User deleted successfully"}, status=status.HTTP_204_NO_CONTENT
        )
