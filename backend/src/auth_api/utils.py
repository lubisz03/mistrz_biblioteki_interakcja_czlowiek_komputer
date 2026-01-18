from django.conf import settings
from django.contrib.auth import authenticate
from django.middleware.csrf import get_token

from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.response import Response

from .serializers import CustomTokenObtainPairSerializer, UserSerializer

from datetime import timedelta


def get_user_tokens(user, remember=False):
    if remember:
        refresh = RefreshToken.for_user(user)
        refresh.set_exp(lifetime=timedelta(days=30))
        refresh["remember_me"] = True

        return {
            "refresh_token": str(refresh),
            "access_token": str(refresh.access_token),
        }
    else:
        refresh = CustomTokenObtainPairSerializer.get_token(user)
        refresh["remember_me"] = False

        return {
            "refresh_token": str(refresh),
            "access_token": str(refresh.access_token),
        }


def set_cookies(res, tokens):
    res.set_cookie(
        key=settings.SIMPLE_JWT["AUTH_COOKIE"],
        value=tokens["access_token"],
        max_age=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"],
        secure=settings.SIMPLE_JWT["AUTH_COOKIE_SECURE"],
        httponly=settings.SIMPLE_JWT["AUTH_COOKIE_HTTP_ONLY"],
        samesite=settings.SIMPLE_JWT["AUTH_COOKIE_SAMESITE"],
    )

    res.set_cookie(
        key=settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
        value=tokens["refresh_token"],
        max_age=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"],
        secure=settings.SIMPLE_JWT["AUTH_COOKIE_SECURE"],
        httponly=settings.SIMPLE_JWT["AUTH_COOKIE_HTTP_ONLY"],
        samesite=settings.SIMPLE_JWT["AUTH_COOKIE_SAMESITE"],
    )
    return res


def authenticate_user(request, login, password, remember_me=False):
    user = authenticate(request, username=login, password=password)

    if user is not None:
        tokens = get_user_tokens(user, remember_me)
        res = Response()
        res = set_cookies(res, tokens)

        res.data = tokens
        res["X-CSRFToken"] = get_token(request)
        del res.data["refresh_token"]
        # Dodaj dane użytkownika do odpowiedzi
        res.data["user"] = UserSerializer(user).data
        return res
    return None


def delete_cookies(res):
    res.delete_cookie(
        settings.SIMPLE_JWT["AUTH_COOKIE"],
        path=settings.SIMPLE_JWT["AUTH_COOKIE_PATH"],
        samesite=settings.SIMPLE_JWT["AUTH_COOKIE_SAMESITE"],
    )
    res.delete_cookie(
        settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
        path=settings.SIMPLE_JWT["AUTH_COOKIE_PATH"],
        samesite=settings.SIMPLE_JWT["AUTH_COOKIE_SAMESITE"],
    )
    res.delete_cookie(
        "csrftoken",
        path=settings.SIMPLE_JWT["AUTH_COOKIE_PATH"],
        samesite=settings.SIMPLE_JWT["AUTH_COOKIE_SAMESITE"],
    )
    res["X-CSRFToken"] = None
    return res
