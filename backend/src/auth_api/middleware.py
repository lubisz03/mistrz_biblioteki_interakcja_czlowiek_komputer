from django.utils.deprecation import MiddlewareMixin
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from .authenticate import CustomAuthentication
import logging

User = get_user_model()

logger = logging.getLogger(__name__)


class CSRFMiddleware(MiddlewareMixin):
    def process_request(self, request):
        csrftoken = settings.CSRF_COOKIE_NAME
        csrf_cookie = request.COOKIES.get(csrftoken, None)
        if csrf_cookie:
            request.META["HTTP_X_CSRFTOKEN"] = csrf_cookie
        return None
