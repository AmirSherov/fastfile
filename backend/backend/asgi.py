"""
ASGI config for backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from django.urls import re_path
from file_transfer.consumers import RoomConsumer
from channels.security.websocket import AllowedHostsOriginValidator

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# Получаем Django ASGI application
django_asgi_app = get_asgi_application()

# Маршрутизация для WebSocket соединений
websocket_urlpatterns = [
    re_path(r'ws/signal/(?P<room_id>\w+)$', RoomConsumer.as_asgi()),
]

# Конфигурация для разных типов протоколов
application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter(
                websocket_urlpatterns
            )
        )
    ),
})
