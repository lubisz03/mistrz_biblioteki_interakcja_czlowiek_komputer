"""
Unified exception handler for Django REST Framework.
Provides consistent error format across all API endpoints.
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from django.http import Http404
from django.core.exceptions import ValidationError, PermissionDenied
from django.conf import settings
import traceback
import logging

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Custom exception handler that returns unified error format using ResponseBuilder:
    {
        "status": "error",
        "message": "Error message",
        "data": {
            "code": "ERROR_CODE",
            "details": {...},
            "timestamp": "2024-01-01T00:00:00Z"
        }
    }
    """
    from src.response_builder import ResponseBuilder
    from django.utils import timezone

    # Call REST framework's default exception handler first
    response = exception_handler(exc, context)

    # Prepare unified error format
    error_code = 'UNKNOWN_ERROR'
    error_message = 'Wystąpił błąd'
    error_details = None
    http_status = status.HTTP_500_INTERNAL_SERVER_ERROR

    if response is not None:
        # REST Framework exception
        if hasattr(exc, 'detail'):
            if isinstance(exc.detail, dict):
                error_message = exc.detail.get('message', str(exc.detail))
                error_details = exc.detail
            else:
                error_message = str(exc.detail)
        else:
            error_message = str(exc)

        error_code = getattr(exc, 'default_code', 'API_ERROR')

        # Map status codes to error codes
        http_status = response.status_code
        if http_status == 400:
            error_code = 'VALIDATION_ERROR'
        elif http_status == 401:
            error_code = 'UNAUTHORIZED'
        elif http_status == 403:
            error_code = 'FORBIDDEN'
        elif http_status == 404:
            error_code = 'NOT_FOUND'
        elif http_status == 500:
            error_code = 'INTERNAL_SERVER_ERROR'

        error_data = {
            'code': error_code,
            'timestamp': timezone.now().isoformat(),
        }
        if error_details:
            error_data['details'] = error_details

        return ResponseBuilder.error(
            message=error_message,
            http_status=http_status,
            data=error_data
        )

    # Handle Django exceptions
    if isinstance(exc, Http404):
        error_data = {
            'code': 'NOT_FOUND',
            'timestamp': timezone.now().isoformat(),
        }
        return ResponseBuilder.error(
            message='Zasób nie został znaleziony',
            http_status=status.HTTP_404_NOT_FOUND,
            data=error_data
        )

    if isinstance(exc, PermissionDenied):
        error_data = {
            'code': 'FORBIDDEN',
            'timestamp': timezone.now().isoformat(),
        }
        return ResponseBuilder.error(
            message='Brak uprawnień do wykonania tej operacji',
            http_status=status.HTTP_403_FORBIDDEN,
            data=error_data
        )

    if isinstance(exc, ValidationError):
        error_data = {
            'code': 'VALIDATION_ERROR',
            'timestamp': timezone.now().isoformat(),
            'details': exc.message_dict if hasattr(exc, 'message_dict') else str(exc),
        }
        return ResponseBuilder.error(
            message='Błąd walidacji danych',
            http_status=status.HTTP_400_BAD_REQUEST,
            data=error_data
        )

    # Log unexpected errors
    logger.error(
        f"Unhandled exception: {type(exc).__name__}: {str(exc)}\n{traceback.format_exc()}"
    )

    # Return generic error for unhandled exceptions
    error_data = {
        'code': 'INTERNAL_SERVER_ERROR',
        'timestamp': timezone.now().isoformat(),
    }
    # In production, don't expose traceback details
    if settings.DEBUG:
        error_data['details'] = {
            'exception_type': type(exc).__name__,
            'exception_message': str(exc),
            'traceback': traceback.format_exc(),
        }

    return ResponseBuilder.error(
        message='Wystąpił nieoczekiwany błąd serwera',
        http_status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        data=error_data
    )
