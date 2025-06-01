// Конфигурационные параметры приложения

// URL бэкенда
export const BACKEND_URL = 'https://fastfile.onrender.com';

// Пути API
export const API_ROUTES = {
  AWAKE_SERVER: `${BACKEND_URL}/api/awake-server`,
  CREATE_ROOM: `${BACKEND_URL}/api/create-room`,
  ROOM_EXISTS: (roomId) => `${BACKEND_URL}/api/room-exists/${roomId}`,
};

// WebSocket URL
export const getWebSocketUrl = (roomId) => {
  return `wss://fastfile.onrender.com/ws/signal/${roomId}`;
};

// Настройки передачи файлов
export const FILE_TRANSFER_CONFIG = {
  // Размер чанка для передачи файлов (в байтах)
  CHUNK_SIZE: 16 * 1024, // 16KB (уменьшен с 64KB для более плавной передачи)
  
  // Максимальный размер буфера DataChannel (в байтах)
  MAX_BUFFER_SIZE: 1024 * 1024, // 1MB
  
  // Пороговое значение для события onbufferedamountlow (в процентах от MAX_BUFFER_SIZE)
  BUFFER_THRESHOLD_PERCENT: 50,
  
  // Задержка между отправкой чанков при большом файле (в мс)
  CHUNK_DELAY: 5, // небольшая задержка для предотвращения переполнения буфера
}; 