import json
import time
from channels.generic.websocket import AsyncWebsocketConsumer


class RoomConsumer(AsyncWebsocketConsumer):
    """
    Консьюмер для обработки WebSocket соединений в определенной комнате.
    Этот класс отвечает только за передачу signaling-сообщений между браузерами,
    сам файл через сервер не проходит.
    """
    
    async def connect(self):
        """Подключение к WebSocket и присоединение к группе комнаты"""
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.room_group_name = f'room_{self.room_id}'
        
        # Присоединяемся к группе комнаты
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        # Принимаем соединение
        await self.accept()
        print(f"WebSocket подключение установлено для комнаты {self.room_id}")
        
        # Отправляем уведомление о подключении всем участникам комнаты
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'connection_status',
                'message': {
                    'type': 'connection_status',
                    'status': 'connected',
                    'client_id': self.channel_name,
                    'timestamp': time.time()
                }
            }
        )
        
    async def disconnect(self, close_code):
        """Отключение от WebSocket и выход из группы комнаты"""
        # Выходим из группы комнаты
        try:
            # Отправляем уведомление об отключении всем участникам комнаты
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'connection_status',
                    'message': {
                        'type': 'connection_status',
                        'status': 'disconnected',
                        'client_id': self.channel_name,
                        'timestamp': time.time()
                    }
                }
            )
            
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
            print(f"WebSocket соединение закрыто для комнаты {self.room_id} с кодом {close_code}")
        except Exception as e:
            print(f"Ошибка при отключении: {str(e)}")
        
    async def receive(self, text_data):
        """
        Получение сообщения от WebSocket и пересылка его другим участникам комнаты.
        Сообщения содержат только signaling-информацию (SDP, ICE).
        """
        try:
            text_data_json = json.loads(text_data)
            message_type = text_data_json.get('type')
            print(f"Получено сообщение типа {message_type} в комнате {self.room_id} от {self.channel_name}")
            
            # Особая обработка для сообщения о подключении клиента
            if message_type == 'client-connected':
                print(f"Получено уведомление о подключении клиента в комнате {self.room_id} от {self.channel_name}")
                # Добавляем дополнительную информацию в сообщение
                text_data_json['timestamp'] = time.time()
                text_data_json['sender_channel_name'] = self.channel_name
                
                # Отправляем уведомление всем участникам комнаты, КРОМЕ отправителя уведомления
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'connection_message',
                        'message': text_data_json,
                        'sender_channel': self.channel_name 
                    }
                )
            elif message_type == 'receiver-ready-for-offer':
                print(f"Получено уведомление 'receiver-ready-for-offer' в комнате {self.room_id} от {self.channel_name}")
                # Пересылаем это сообщение всем в группе (пока что)
                # В идеале, нужно найти отправителя (peer, который будет слать Offer) и отправить только ему.
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'signal_message', # Используем тот же тип, что и для offer/answer/ice
                        'message': text_data_json,
                        'sender_channel': self.channel_name
                    }
                )
            else:
                # Пересылаем обычные signaling-сообщения (offer, answer, ice-candidate)
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'signal_message',
                        'message': text_data_json
                    }
                )
        except Exception as e:
            print(f"Ошибка в receive: {str(e)}")
            # Отправляем сообщение об ошибке клиенту
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': str(e)
            }))
    
    async def connection_message(self, event):
        """Отправка сообщения о подключении клиента"""
        message = event['message']
        sender_channel = event.get('sender_channel')
        
        # Не отправляем сообщение обратно тому, кто его инициировал
        if self.channel_name != sender_channel:
            print(f"Отправка уведомления о подключении клиента в комнате {self.room_id} для {self.channel_name}")
            try:
                await self.send(text_data=json.dumps(message))
            except Exception as e:
                print(f"Ошибка в connection_message для {self.channel_name}: {str(e)}")
        else:
            print(f"Пропуск отправки connection_message самому себе: {self.channel_name}")
    
    async def connection_status(self, event):
        """Отправка статуса подключения"""
        try:
            message = event['message']
            print(f"Отправка статуса подключения в комнате {self.room_id}: {message['status']}")
            # Отправляем сообщение клиенту
            await self.send(text_data=json.dumps(message))
        except Exception as e:
            print(f"Ошибка в connection_status: {str(e)}")
            # Отправляем сообщение об ошибке клиенту
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': str(e)
            }))
            
    async def signal_message(self, event):
        """Отправка signaling-сообщения клиенту (offer, answer, ice, receiver-ready-for-offer)"""
        message = event['message']
        sender_channel = event.get('sender_channel')

        # Не отправляем offer/answer/ice/receiver-ready-for-offer обратно тому, кто его инициировал, 
        # за исключением случая, когда это 'receiver-ready-for-offer', которое должен получить отправитель.
        # TODO: Более умная маршрутизация, если в комнате >2 участников.
        # Сейчас, если сообщение 'receiver-ready-for-offer', его не должен получить сам получатель, который его отправил.
        # А если это offer/answer/ice, то его не должен получить тот, кто их сгенерировал.
        
        should_send = True
        if message.get('type') == 'receiver-ready-for-offer':
            if self.channel_name == sender_channel: # Получатель не должен получить свое же ready-сообщение
                should_send = False
        elif sender_channel and self.channel_name == sender_channel: # Отправитель offer/answer/ice не должен их получить
            should_send = False

        if should_send:
            print(f"Отправка signal_message типа {message.get('type')} в комнате {self.room_id} для {self.channel_name} (от {sender_channel})")
            try:
                await self.send(text_data=json.dumps(message))
            except Exception as e:
                print(f"Ошибка в signal_message для {self.channel_name}: {str(e)}")
        else:
            print(f"Пропуск отправки signal_message типа {message.get('type')} самому себе: {self.channel_name}") 