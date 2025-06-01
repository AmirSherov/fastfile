#!/usr/bin/env python
import os
import sys
import subprocess
import signal
import time

def main():
    # Устанавливаем переменную окружения для Django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
    
    # Запускаем Daphne для WebSocket
    print("Запуск сервера с поддержкой WebSocket...")
    
    # Команда для запуска Daphne
    cmd = [sys.executable, "-m", "daphne", "backend.asgi:application", "-b", "0.0.0.0", "-p", "8000"]
    
    try:
        # Запускаем процесс
        process = subprocess.Popen(cmd)
        print(f"Сервер запущен на http://127.0.0.1:8000")
        print("Нажмите Ctrl+C для остановки сервера")
        
        # Ждем завершения процесса
        process.wait()
    except KeyboardInterrupt:
        print("\nОстановка сервера...")
        process.send_signal(signal.SIGINT)
        time.sleep(1)
        print("Сервер остановлен")
    except Exception as e:
        print(f"Ошибка: {e}")
        if 'process' in locals():
            process.kill()

if __name__ == "__main__":
    main() 