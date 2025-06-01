from django.shortcuts import render
import uuid
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

# Create your views here.

@csrf_exempt
@require_http_methods(["POST"])
def create_room(request):
    """
    Создает новую комнату и возвращает ее уникальный ID.
    Клиент использует этот ID для создания URL комнаты.
    """
    # Генерируем уникальный ID комнаты (первые 8 символов UUID)
    room_id = str(uuid.uuid4())[:8]
    
    # Возвращаем ID комнаты
    return JsonResponse({
        'success': True,
        'room_id': room_id,
    })

@require_http_methods(["GET"])
def room_exists(request, room_id):
    """
    Проверяет существование комнаты.
    В текущей реализации всегда возвращает True, так как комната
    создается по требованию при подключении через WebSocket.
    """
    # В этой простой реализации считаем, что комната всегда существует
    # В реальном приложении здесь была бы проверка наличия комнаты в БД
    return JsonResponse({
        'exists': True,
    })
