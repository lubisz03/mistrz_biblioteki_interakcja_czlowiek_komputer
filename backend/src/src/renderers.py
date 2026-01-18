from rest_framework.renderers import JSONRenderer
from .response_builder import ResponseStatus


class CustomJSONRenderer(JSONRenderer):
    def render(self, data, accepted_media_type=None, renderer_context=None):
        response_context = renderer_context.get("response")

        if isinstance(data, dict) and data.get("status") in [
            e.value for e in ResponseStatus
        ]:
            return super().render(data, accepted_media_type, renderer_context)

        if response_context and 200 <= response_context.status_code < 300:
            response_data = {
                "status": ResponseStatus.SUCCESS.value,
                "message": "Operation successful",
                "data": data,
            }
            return super().render(response_data, accepted_media_type, renderer_context)
        else:
            return super().render(data, accepted_media_type, renderer_context)
