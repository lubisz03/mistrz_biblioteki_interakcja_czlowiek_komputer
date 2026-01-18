from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


class CustomUserAdmin(UserAdmin):
    model = User
    search_fields = (
        "email",
        "username",
        "first_name",
        "last_name",
    )

    list_display = (
        "email",
        "username",
        "first_name",
        "last_name",
        "is_staff",
        "is_active",
    )
    ordering = ("email",)


admin.site.register(User, CustomUserAdmin)
