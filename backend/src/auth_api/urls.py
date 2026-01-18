from django.urls import path
from .views import *

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("register/", RegistrationView.as_view(), name="register"),
    path("token/refresh/", CookieTokenRefreshView.as_view(), name="token_refresh"),
    path("token/verify/", CustomTokenVerifyView.as_view(), name="token_verify"),
    path("token/websocket/", WebSocketTokenView.as_view(), name="websocket_token"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("logout-all/", LogoutAllView.as_view(), name="logout_all"),
    path("user/", UserDetailsView.as_view(), name="user"),
    path("user/delete/", DeleteUserView.as_view(), name="delete_user"),
    path(
        "password-reset/",
        PasswordResetRequestView.as_view(),
        name="password-reset-request",
    ),
    path(
        "password-reset/<uidb64>/<token>/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("change-email/", ChangeEmailView.as_view(), name="change_email"),
    path("change-password/", ChangePasswordView.as_view(), name="change_password"),
]
