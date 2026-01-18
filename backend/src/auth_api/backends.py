from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model
from .exceptions import UserNotActive

User = get_user_model()


class UsernameOrEmailBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None or password is None:
            return None
        try:
            user = (
                User.objects.get(email=username)
                if "@" in username
                else User.objects.get(username=username)
            )

            if not user.is_active:
                raise UserNotActive("Account is inactive.")
            elif user.check_password(password):
                return user
        except User.DoesNotExist:
            return None
        return None

    def get_user(self, user_id):
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
