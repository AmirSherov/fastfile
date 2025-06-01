"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from file_transfer import views as file_transfer_views
from .views import AwakeServer

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/create-room', file_transfer_views.create_room, name='create_room'),
    path('api/room-exists/<str:room_id>', file_transfer_views.room_exists, name='room_exists'),
    path('api/awake-server', AwakeServer.as_view(), name='awake_server')
]
