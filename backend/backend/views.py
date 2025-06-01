from django.http import HttpResponse
from django.views import View

class AwakeServer(View):
    def get(self, request, *args, **kwargs):
        """Обрабатывает GET-запросы и возвращает простой ответ 200 OK."""
        return HttpResponse(status=200)
