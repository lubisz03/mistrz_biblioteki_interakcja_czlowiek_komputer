from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdminOrReadOnly(BasePermission):
    """
    Allow GET (read-only) access to authenticated users,
    but require admin status for unsafe methods (POST, PUT, DELETE).
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return (
                request.user
                and request.user.is_authenticated
                and request.user.is_active
            )
        return request.user and request.user.is_staff


class AllowUnauthenticated(BasePermission):
    message = "This view is only accessible by unauthenticated users."

    def has_permission(self, request, view):
        return not request.user.is_authenticated or request.user.is_authenticated


class IsStaff(BasePermission):
    message = "This view is only accessible by stuff users."

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.is_staff
