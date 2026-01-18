from rest_framework.response import Response
from rest_framework import status
from enum import Enum


class ResponseStatus(Enum):
    SUCCESS = "success"
    ERROR = "error"


class ResponseBuilder:
    @staticmethod
    def success(
        message: str = "Operation successful",
        http_status: int = status.HTTP_200_OK,
        data: dict | None = None,
    ) -> Response:
        response_data = {
            "status": ResponseStatus.SUCCESS.value,
            "message": message,
        }
        if data is not None:
            response_data["data"] = data

        return Response(
            response_data,
            status=http_status,
        )

    @staticmethod
    def error(
        message: str = "An error occurred",
        http_status: int = status.HTTP_400_BAD_REQUEST,
        data: dict | None = None,
    ):
        response_data = {
            "status": ResponseStatus.ERROR.value,
            "message": message,
        }
        if data is not None:
            response_data["data"] = data

        return Response(
            response_data,
            status=http_status,
        )
