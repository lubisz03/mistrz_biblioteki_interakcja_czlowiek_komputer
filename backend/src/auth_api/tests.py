import json
from unittest.mock import patch, MagicMock
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.urls import reverse
from django.conf import settings
from rest_framework import status
from rest_framework.test import APITestCase, APIClient
from rest_framework_simplejwt.tokens import RefreshToken, OutstandingToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

User = get_user_model()


class AuthenticationTestCase(APITestCase):
    """Base test case with common setup for authentication tests."""

    def setUp(self):
        self.client = APIClient()
        self.user_data = {
            "email": "testuser@example.com",
            "password": "testpass123",
            "username": "testuser",
            "first_name": "Test",
            "last_name": "User",
        }
        self.user = User.objects.create_user(**self.user_data)
        self.inactive_user = User.objects.create_user(
            email="inactive@example.com",
            password="testpass123",
            username="inactive",
            is_active=False,
        )


class LoginViewTest(AuthenticationTestCase):
    """Tests for LoginView."""

    def setUp(self):
        super().setUp()
        self.login_url = reverse("login")

    def test_successful_login_with_email(self):
        """Test successful login with email."""
        data = {
            "login": self.user_data["email"],
            "password": self.user_data["password"],
        }
        response = self.client.post(self.login_url, data)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access_token", response.data)
        self.assertNotIn("refresh_token", response.data)  # Should be in cookie
        self.assertIn("X-CSRFToken", response)

    def test_successful_login_with_username(self):
        """Test successful login with username."""
        data = {
            "login": self.user_data["username"],
            "password": self.user_data["password"],
        }
        response = self.client.post(self.login_url, data)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access_token", response.data)

    def test_login_with_remember_me(self):
        """Test login with remember_me flag."""
        data = {
            "login": self.user_data["email"],
            "password": self.user_data["password"],
            "remember_me": True,
        }
        response = self.client.post(self.login_url, data)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access_token", response.data)

    def test_login_with_invalid_credentials(self):
        """Test login with invalid credentials."""
        data = {"login": self.user_data["email"], "password": "wrongpassword"}
        response = self.client.post(self.login_url, data)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_login_with_inactive_user(self):
        """Test login with inactive user."""
        data = {"login": "inactive@example.com", "password": "testpass123"}
        response = self.client.post(self.login_url, data)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["message"], "Account is inactive")

    def test_login_with_missing_credentials(self):
        """Test login with missing credentials."""
        data = {"login": self.user_data["email"]}
        response = self.client.post(self.login_url, data)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_login_with_nonexistent_user(self):
        """Test login with nonexistent user."""
        data = {"login": "nonexistent@example.com", "password": "testpass123"}
        response = self.client.post(self.login_url, data)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class RegistrationViewTest(AuthenticationTestCase):
    """Tests for RegistrationView."""

    def setUp(self):
        super().setUp()
        self.registration_url = reverse("register")

    def test_successful_registration(self):
        """Test successful user registration."""
        data = {
            "email": "newuser@example.com",
            "password": "newpass123",
            "repeat_password": "newpass123",
            "username": "newuser",
            "first_name": "New",
            "last_name": "User",
        }
        response = self.client.post(self.registration_url, data)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access_token", response.data)
        self.assertTrue(User.objects.filter(email=data["email"]).exists())

    def test_registration_with_existing_email(self):
        """Test registration with existing email."""
        data = {
            "email": self.user_data["email"],  # Already exists
            "password": "newpass123",
            "username": "newuser",
        }
        response = self.client.post(self.registration_url, data)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_registration_with_invalid_data(self):
        """Test registration with invalid data."""
        data = {"email": "invalid-email", "password": "short", "username": ""}
        response = self.client.post(self.registration_url, data)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)


class CookieTokenRefreshViewTest(AuthenticationTestCase):
    """Tests for CookieTokenRefreshView."""

    def setUp(self):
        super().setUp()
        self.refresh_url = reverse("token_refresh")
        self.refresh_token = RefreshToken.for_user(self.user)

    def test_successful_token_refresh(self):
        """Test successful token refresh."""
        self.client.cookies["refresh"] = str(self.refresh_token)
        response = self.client.post(self.refresh_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_token_refresh_with_invalid_token(self):
        """Test token refresh with invalid token."""
        data = {"refresh": "invalid_token"}
        response = self.client.post(self.refresh_url, data)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class CustomTokenVerifyViewTest(AuthenticationTestCase):
    """Tests for CustomTokenVerifyView."""

    def setUp(self):
        super().setUp()
        self.verify_url = reverse("token_verify")
        self.access_token = RefreshToken.for_user(self.user).access_token

    def test_valid_token_verification(self):
        """Test verification of valid token."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")
        response = self.client.post(self.verify_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["valid"])
        self.assertIn("user", response.data)

    def test_invalid_token_verification(self):
        """Test verification of invalid token."""
        self.client.credentials(HTTP_AUTHORIZATION="Bearer invalid_token")
        response = self.client.post(self.verify_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(response.data["valid"])

    def test_no_token_verification(self):
        """Test verification without token."""
        response = self.client.post(self.verify_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(response.data["valid"])


class LogoutViewTest(AuthenticationTestCase):
    """Tests for LogoutView."""

    def setUp(self):
        super().setUp()
        self.logout_url = reverse("logout")
        self.refresh_token = RefreshToken.for_user(self.user)
        self.client.force_authenticate(user=self.user)

    @patch("auth_api.views.get_user_tokens")
    def test_successful_logout(self, mock_get_tokens):
        """Test successful logout."""
        self.client.cookies["refresh"] = str(self.refresh_token)

        with patch("auth_api.views.get_user_tokens") as mock_get_tokens:
            mock_get_tokens.return_value = {"refresh_token": str(self.refresh_token)}

            response = self.client.post(self.logout_url)

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data["message"], "Successfully logged out")

    @patch("auth_api.views.get_user_tokens")
    def test_logout_without_refresh_token(self, mock_get_tokens):
        """Test logout without refresh token."""
        mock_get_tokens.return_value = {"refresh": None}

        response = self.client.post(self.logout_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logout_unauthenticated(self):
        """Test logout without authentication."""
        self.client.force_authenticate(user=None)
        response = self.client.post(self.logout_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class LogoutAllViewTest(AuthenticationTestCase):
    """Tests for LogoutAllView."""

    def setUp(self):
        super().setUp()
        self.logout_all_url = reverse("logout_all")
        self.client.force_authenticate(user=self.user)
        # Create some tokens for the user
        self.refresh_token1 = RefreshToken.for_user(self.user)
        self.refresh_token2 = RefreshToken.for_user(self.user)

    def test_successful_logout_all(self):
        """Test successful logout from all devices."""
        response = self.client.post(self.logout_all_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "Successfully logged out")

    def test_logout_all_unauthenticated(self):
        """Test logout all without authentication."""
        self.client.force_authenticate(user=None)
        response = self.client.post(self.logout_all_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class UserDetailsViewTest(AuthenticationTestCase):
    """Tests for UserDetailsView."""

    def setUp(self):
        super().setUp()
        self.user_url = reverse("user")
        self.client.force_authenticate(user=self.user)

    def test_get_user_details(self):
        """Test getting user details."""
        response = self.client.get(self.user_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], self.user.email)
        self.assertEqual(response.data["username"], self.user.username)

    def test_update_user_details(self):
        """Test updating user details."""
        data = {"first_name": "Updated", "last_name": "Name"}
        response = self.client.patch(self.user_url, data)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Updated")
        self.assertEqual(self.user.last_name, "Name")

    def test_user_details_unauthenticated(self):
        """Test getting user details without authentication."""
        self.client.force_authenticate(user=None)
        response = self.client.get(self.user_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class PasswordResetRequestViewTest(AuthenticationTestCase):
    """Tests for PasswordResetRequestView."""

    def setUp(self):
        super().setUp()
        self.password_reset_url = reverse("password-reset-request")

    @patch("auth_api.views.Email")
    def test_password_reset_request_active_user(self, mock_email):
        """Test password reset request for active user."""
        mock_email_instance = MagicMock()
        mock_email.return_value = mock_email_instance

        data = {"email": self.user.email}
        response = self.client.post(self.password_reset_url, data)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], "Password reset link sent.")
        mock_email_instance.send.assert_called_once()

    def test_password_reset_request_nonexistent_user(self):
        """Test password reset request for nonexistent user."""
        data = {"email": "nonexistent@example.com"}
        response = self.client.post(self.password_reset_url, data)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_reset_request_invalid_email(self):
        """Test password reset request with invalid email."""
        data = {"email": "invalid-email"}
        response = self.client.post(self.password_reset_url, data)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PasswordResetConfirmViewTest(AuthenticationTestCase):
    """Tests for PasswordResetConfirmView."""

    def setUp(self):
        super().setUp()
        self.token = default_token_generator.make_token(self.user)
        self.password_reset_confirm_url = reverse(
            "password-reset-confirm",
            kwargs={"uidb64": self.user.pk, "token": self.token},
        )

    def test_successful_password_reset(self):
        """Test successful password reset."""
        data = {"new_password": "newpassword123", "new_password2": "newpassword123"}
        response = self.client.post(self.password_reset_confirm_url, data)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], "Password reset successfully.")

        # Verify password was changed
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newpassword123"))

    def test_password_reset_invalid_token(self):
        """Test password reset with invalid token."""
        url = reverse(
            "password-reset-confirm",
            kwargs={"uidb64": self.user.pk, "token": "invalid-token"},
        )

        data = {"new_password": "newpassword123", "confirm_password": "newpassword123"}
        response = self.client.post(url, data)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Invalid or expired token.")

    def test_password_reset_invalid_user(self):
        """Test password reset with invalid user ID."""
        url = reverse(
            "password-reset-confirm", kwargs={"uidb64": 99999, "token": self.token}
        )

        data = {"new_password": "newpassword123", "confirm_password": "newpassword123"}
        response = self.client.post(url, data)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Invalid user or token.")

    def test_password_reset_password_mismatch(self):
        """Test password reset with password mismatch."""
        data = {
            "new_password": "newpassword123",
            "confirm_password": "differentpassword123",
        }
        response = self.client.post(self.password_reset_confirm_url, data)

        self.assertEqual(response.status_code, status.HTTP_406_NOT_ACCEPTABLE)


class ChangeEmailViewTest(AuthenticationTestCase):
    """Tests for ChangeEmailView."""

    def setUp(self):
        super().setUp()
        self.change_email_url = reverse("change_email")
        self.client.force_authenticate(user=self.user)

    def test_successful_email_change(self):
        """Test successful email change."""
        data = {"new_email": "newemail@example.com"}
        response = self.client.post(self.change_email_url, data)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "Email updated successfully")

        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "newemail@example.com")

    def test_email_change_invalid_email(self):
        """Test email change with invalid email."""
        data = {"new_email": "invalid-email"}
        response = self.client.post(self.change_email_url, data)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_email_change_existing_email(self):
        """Test email change with existing email."""
        User.objects.create_user(
            email="existing@example.com", password="testpass123", username="existing"
        )

        data = {"new_email": "existing@example.com"}
        response = self.client.post(self.change_email_url, data)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_email_change_unauthenticated(self):
        """Test email change without authentication."""
        self.client.force_authenticate(user=None)
        data = {"new_email": "newemail@example.com"}
        response = self.client.post(self.change_email_url, data)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ChangePasswordViewTest(AuthenticationTestCase):
    """Tests for ChangePasswordView."""

    def setUp(self):
        super().setUp()
        self.change_password_url = reverse("change_password")
        self.client.force_authenticate(user=self.user)

    def test_successful_password_change(self):
        """Test successful password change."""
        data = {
            "old_password": self.user_data["password"],
            "new_password": "newpassword123",
            "confirm_password": "newpassword123",
        }
        response = self.client.post(self.change_password_url, data)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "Password updated successfully")

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("newpassword123"))

    def test_password_change_wrong_old_password(self):
        """Test password change with wrong old password."""
        data = {"old_password": "wrongpassword", "new_password": "newpassword123"}
        response = self.client.post(self.change_password_url, data)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_change_unauthenticated(self):
        """Test password change without authentication."""
        self.client.force_authenticate(user=None)
        data = {
            "old_password": self.user_data["password"],
            "new_password": "newpassword123",
        }
        response = self.client.post(self.change_password_url, data)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class DeleteUserViewTest(AuthenticationTestCase):
    """Tests for DeleteUserView."""

    def setUp(self):
        super().setUp()
        self.delete_user_url = reverse("delete_user")
        self.client.force_authenticate(user=self.user)

    def test_successful_user_deletion(self):
        """Test successful user deletion."""
        user_id = self.user.id
        response = self.client.delete(self.delete_user_url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(response.data["message"], "User deleted successfully")
        self.assertFalse(User.objects.filter(id=user_id).exists())

    def test_user_deletion_unauthenticated(self):
        """Test user deletion without authentication."""
        self.client.force_authenticate(user=None)
        response = self.client.delete(self.delete_user_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class IntegrationTest(AuthenticationTestCase):
    """Integration tests for authentication flow."""

    def test_full_authentication_flow(self):
        """Test complete authentication flow."""
        # Register new user
        registration_data = {
            "email": "flowtest@example.com",
            "password": "flowpass123",
            "repeat_password": "flowpass123",
            "username": "flowtest",
        }
        register_response = self.client.post(reverse("register"), registration_data)
        self.assertEqual(register_response.status_code, status.HTTP_201_CREATED)

        # Login
        login_data = {
            "login": registration_data["email"],
            "password": registration_data["password"],
        }
        login_response = self.client.post(reverse("login"), login_data)
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

        # Use token to access protected resource
        access_token = login_response.data["access_token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")

        user_response = self.client.get(reverse("user"))
        self.assertEqual(user_response.status_code, status.HTTP_200_OK)
        self.assertEqual(user_response.data["email"], registration_data["email"])

        # Logout
        logout_response = self.client.post(reverse("logout"))
        self.assertEqual(logout_response.status_code, status.HTTP_200_OK)
