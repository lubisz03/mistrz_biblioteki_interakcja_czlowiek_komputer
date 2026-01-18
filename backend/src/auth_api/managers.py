from django.contrib.auth.models import BaseUserManager
import random


class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)

        if "username" not in extra_fields or not extra_fields["username"]:
            username = self.generate_unique_username(email)
            extra_fields["username"] = username

        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        from .models import User

        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, password, **extra_fields)

    def generate_unique_username(self, email):
        from .models import User

        base_username = email.split("@")[0]
        username = base_username
        r = random.randint(1, 100000)
        max_len = 150 - (len(str(r)) + 1)
        if len(base_username) > max_len:
            base_username = base_username[:max_len]

        while User.objects.filter(username=username).exists():
            username = f"{base_username}-{r}"
            r = random.randint(1, 100000)

        return username
