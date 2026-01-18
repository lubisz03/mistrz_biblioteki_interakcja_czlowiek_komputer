"""
WebSocket URL routing for the application.
"""
from django.urls import re_path
from quiz.consumers import MatchConsumer
from quiz.notification_consumer import NotificationConsumer

websocket_urlpatterns = [
    re_path(r'ws/match/(?P<match_id>\d+)/$', MatchConsumer.as_asgi()),
    re_path(r'ws/notifications/$', NotificationConsumer.as_asgi()),
]
