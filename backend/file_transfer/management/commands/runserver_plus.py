from django.core.management.base import BaseCommand
from django.core.management import call_command
import threading
import sys
import os

class Command(BaseCommand):
    help = 'Запускает Django development server с поддержкой WebSocket'

    def handle(self, *args, **options):
        self.stdout.write(
            self.style.SUCCESS('Запуск Django сервера с поддержкой WebSocket...')
        )
        
        # Запускаем сервер
        try:
            call_command('runserver', '127.0.0.1:8000', use_reloader=True, use_threading=True)
        except KeyboardInterrupt:
            self.stdout.write(self.style.SUCCESS('Сервер остановлен'))
            sys.exit(0) 