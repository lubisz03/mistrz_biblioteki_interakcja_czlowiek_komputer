from django.contrib.auth import get_user_model
from django.core.validators import EmailValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.password_validation import validate_password
from django.conf import settings

from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import serializers
from rest_framework_simplejwt import (
    serializers as jwt_serializers,
    exceptions as jwt_exceptions,
)
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class RegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    repeat_password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(required=False)
    last_name = serializers.CharField(required=False)

    class Meta:
        model = User
        fields = (
            "email",
            "password",
            "repeat_password",
            "first_name",
            "last_name",
        )

    def validate_email(self, value):
        """Walidacja emaila - musi być z domeny @p.lodz.pl lub @edu.p.lodz.pl"""
        import re
        email_pattern = r'^[^@]+@(edu\.)?p\.lodz\.pl$'
        if not re.match(email_pattern, value):
            raise serializers.ValidationError(
                "Email musi być z domeny @p.lodz.pl lub @edu.p.lodz.pl"
            )
        return value

    def validate(self, data):
        if data["password"] != data["repeat_password"]:
            raise serializers.ValidationError("Passwords do not match.")
        return data

    def create(self, validated_data):
        validated_data.pop("repeat_password")
        email = validated_data["email"]

        # Wyciągnij indeks z emaila (część przed @)
        index = email.split("@")[0]

        # Ustaw username jako indeks
        validated_data["username"] = index

        user = User.objects.create_user(
            email=email,
            username=index,
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
        )
        return user


class LoginSerializer(serializers.Serializer):
    login = serializers.CharField()
    password = serializers.CharField(
        style={"input_type": "password"}, write_only=True)
    remember_me = serializers.BooleanField(default=False, required=False)

    def validate_login(self, value):
        email_validator = EmailValidator()
        try:
            email_validator(value)
            self.is_email = True
        except DjangoValidationError:
            self.is_email = False
        return value

    def validate(self, data):
        login = data.get("login")
        password = data.get("password")

        if not login:
            raise serializers.ValidationError(
                "Login (email or username) is required.")
        if not password:
            raise serializers.ValidationError("Password is required.")

        return data


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        fields = ("id", "email", "first_name", "last_name", "username")


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        fields = ("email", "first_name", "last_name", "username")


class CookieTokenRefreshSerializer(jwt_serializers.TokenRefreshSerializer):
    refresh = None

    def validate(self, attrs):
        attrs["refresh"] = self.context["request"].COOKIES.get(
            settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"]
        )
        if not attrs["refresh"]:
            raise jwt_exceptions.InvalidToken(
                "No valid token found in cookie 'refresh'"
            )

        data = super().validate(attrs)

        old_refresh = RefreshToken(attrs["refresh"], verify=False)

        user_id = old_refresh.payload.get("user_id")
        if not user_id:
            raise jwt_exceptions.InvalidToken(
                "Invalid token payload: no user_id")

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            raise jwt_exceptions.InvalidToken("User not found")

        new_refresh = RefreshToken.for_user(user)

        remember_me = old_refresh.payload.get("remember_me", False)
        new_refresh["remember_me"] = remember_me

        if "exp" in old_refresh.payload:
            new_refresh.payload["exp"] = old_refresh.payload["exp"]

        data["refresh"] = str(new_refresh)
        data["access"] = str(new_refresh.access_token)

        return data


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["first_name"] = user.first_name
        token["last_name"] = user.last_name
        return token


class VerifySerializer(serializers.Serializer):
    valid = serializers.BooleanField()
    message = serializers.CharField(max_length=255)
    user = UserSerializer(required=False, allow_null=True)


class LogoutSerializer(serializers.Serializer):
    message = serializers.CharField()


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(
        required=True, validators=[validate_password])
    confirm_password = serializers.CharField(required=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "New passwords must match."}
            )
        return attrs

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError(
                {"old_password": "Old password is not correct."}
            )
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    login = serializers.CharField()
    password = serializers.CharField(
        style={"input_type": "password"}, write_only=True)
    remember_me = serializers.BooleanField(default=False)

    def validate_login(self, value):
        email_validator = EmailValidator()
        try:
            email_validator(value)
            self.is_email = True
        except DjangoValidationError:
            self.is_email = False
        return value

    def validate(self, data):
        login = data.get("login")
        password = data.get("password")

        if not login:
            raise serializers.ValidationError(
                "Login (email or username) is required.")
        if not password:
            raise serializers.ValidationError("Password is required.")

        return data


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        try:
            user = User.objects.get(email=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("Email address not found.")
        return value


class PasswordResetSerializer(serializers.Serializer):
    new_password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )
    new_password2 = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )

    def validate_new_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError(
                "Password must be at least 8 characters long."
            )
        return value

    def validate_new_password2(self, value):
        if len(value) < 8:
            raise serializers.ValidationError(
                "Password must be at least 8 characters long."
            )
        return value

    def validate(self, attrs):
        if attrs.get("new_password") != attrs.get("new_password2"):
            raise serializers.ValidationError(
                {"new_password2": "Passwords do not match."}
            )
        return super().validate(attrs)


class ChangeEmailSerializer(serializers.Serializer):
    new_email = serializers.EmailField()

    def validate_new_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email is already in use.")
        return value
