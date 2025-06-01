'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { API_ROUTES, getWebSocketUrl } from '../../config';
import styles from '../../styles/Home.module.scss';

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
const APP_STATES = {
  CONNECTING: 'connecting',  // Подключение к комнате
  CONNECTED: 'connected',    // Подключен, готов к получению
  RECEIVING: 'receiving',    // Получение файла
  COMPLETE: 'complete',      // Завершение получения
  ERROR: 'error'             // Ошибка
};

export default function RoomPage() {
  const params = useParams();
  const roomId = params.id;
  
  const [appState, setAppState] = useState(APP_STATES.CONNECTING);
  const [error, setError] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [progress, setProgress] = useState(0);
  const [receivedSize, setReceivedSize] = useState(0);
  const [fileBlob, setFileBlob] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const forceUpdateState = (state, isConnected = false) => {
    console.log(`Принудительное обновление состояния на: ${state}, isConnected: ${isConnected}`);
    setAppState(state);
    setIsConnected(isConnected);
    setTimeout(() => {
      setAppState(state);
      setIsConnected(isConnected);
    }, 100);
  };
  
  useEffect(() => {
    const checkRoom = async () => {
      try {
        const response = await fetch(API_ROUTES.ROOM_EXISTS(roomId));
        const data = await response.json();
        
        if (!data.exists) {
          throw new Error('Комната не существует');
        }
        connectToRoom();
      } catch (err) {
        console.error('Ошибка при проверке комнаты:', err);
        setError('Комната не существует или произошла ошибка подключения.');
        forceUpdateState(APP_STATES.ERROR);
      }
    };
    
    checkRoom();
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [roomId]);
  const connectToRoom = () => {
    try {
      const wsUrl = getWebSocketUrl(roomId);
      console.log(`Подключение к WebSocket: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      console.log('[Получатель] RTCPeerConnection создан.');
      const iceCandidatesBuffer = [];
      let fileChunks = [];
      let receivedBytes = 0;
      let currentFileInfo = null;
      pc.ondatachannel = (event) => {
        const channel = event.channel;
        
        channel.onopen = () => {
          console.log('[Получатель] Канал данных открыт!');
          setIsConnected(true);
          setAppState(APP_STATES.CONNECTED);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'client-connected',
              message: 'Клиент успешно подключился (канал данных открыт)'
            }));
          }
        };
        
        channel.onclose = () => {
          console.log('[Получатель] Канал данных закрыт.');
          setIsConnected(false);
          setAppState(APP_STATES.CONNECTING);
        };
        
        if (typeof channel.maxMessageSize !== 'undefined') {
          console.log(`[Получатель] Максимальный размер сообщения DataChannel: ${channel.maxMessageSize} байт`);
        }
        
        channel.onmessage = (event) => {
          if (typeof event.data === 'string') {
            try {
              const message = JSON.parse(event.data);
              console.log('Получено сообщение через DataChannel:', message.type);
              
              if (message.type === 'file-info') {
                currentFileInfo = message.data;
                setFileInfo(message.data);
                setAppState(APP_STATES.RECEIVING);
                console.log('[Получатель] Получена информация о файле.');
                
                fileChunks = [];
                receivedBytes = 0;
              } else if (message.type === 'file-complete') {
                console.log('[Получатель] Файл полностью получен.');
                
                const blob = new Blob(fileChunks, { type: currentFileInfo.type || 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                
                setFileBlob(blob);
                setDownloadUrl(url);
                setAppState(APP_STATES.COMPLETE);
                console.log('URL для скачивания создан:', url);
                
                fileChunks = [];
              }
            } catch (e) {
              console.error('Ошибка при обработке сообщения:', e);
            }
          } else {
            console.log('Получен чанк файла размером:', event.data.byteLength);
            fileChunks.push(event.data);
            receivedBytes += event.data.byteLength;
            setReceivedSize(receivedBytes);
            if (currentFileInfo && currentFileInfo.size) {
              const progress = Math.min(100, Math.floor((receivedBytes / currentFileInfo.size) * 100));
              setProgress(progress);
            }
          }
        };
        
        channel.onerror = (error) => {
          console.error('Ошибка канала данных:', error);
          setError('Ошибка при получении данных. Пожалуйста, попробуйте еще раз.');
          setAppState(APP_STATES.ERROR);
        };
      };

      ws.onopen = () => {
        console.log('[Получатель] WebSocket соединение установлено. Отправка receiver-ready-for-offer.');
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'receiver-ready-for-offer', roomId: roomId }));
        }
      };
      
      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'offer') {
            console.log('[Получатель] Получен Offer. Установка RemoteDescription...');
            await pc.setRemoteDescription(new RTCSessionDescription({ type: message.type, sdp: message.sdp }));
            console.log('[Получатель] RemoteDescription (Offer) установлен. Создание Answer...');
            
            if (iceCandidatesBuffer.length > 0) {
              console.log(`[Получатель] Добавляем ${iceCandidatesBuffer.length} буферизованных ICE кандидатов.`);
              for (const candidate of iceCandidatesBuffer) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                  console.error('[Получатель] Ошибка при добавлении буферизованного ICE кандидата:', e);
                }
              }
              iceCandidatesBuffer.length = 0;
            }
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log('[Получатель] LocalDescription (Answer) установлен. Отправка Answer.');
            
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: pc.localDescription.type,
                sdp: pc.localDescription.sdp
              }));
            } else {
              console.error('[Получатель] WebSocket не готов для отправки ответа');
            }
          } else if (message.type === 'ice-candidate') {
            if (message.candidate) {
              if (pc.remoteDescription === null || pc.remoteDescription.type === '') {
                iceCandidatesBuffer.push(message.candidate);
              } else {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                } catch (e) {
                  console.error('[Получатель] Ошибка при добавлении ICE кандидата от отправителя:', e);
                }
              }
            }
          } else if (message.type === 'client-connected') {
            setIsConnected(true);
          } else if (message.type === 'connection_status') {
            if (message.status === 'connected') {
              setIsConnected(true);
            } else if (message.status === 'disconnected') {
              setIsConnected(false);
              setAppState(APP_STATES.CONNECTING);
            }
          } else if (message.type === 'error') {
            console.error('Ошибка от сервера:', message.message);
            setError(message.message || 'Произошла ошибка на сервере');
            setAppState(APP_STATES.ERROR);
          }
        } catch (e) {
          console.error('Ошибка при обработке сообщения WebSocket:', e);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket ошибка:', error);
        setError('Ошибка соединения. Пожалуйста, попробуйте еще раз.');
        setAppState(APP_STATES.ERROR);
      };
      
      ws.onclose = (event) => {
        console.log(`WebSocket соединение закрыто с кодом ${event.code}: ${event.reason}`);
        if (event.code !== 1000) {
          setError(`Соединение закрыто: ${event.reason || 'Неизвестная ошибка'}`);
          setAppState(APP_STATES.ERROR);
        }
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'ice-candidate',
              candidate: event.candidate
            }));
          }
        }
      };
      pc.onconnectionstatechange = (event) => {
        console.log(`[Получатель] Состояние WebRTC соединения: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          console.log('[Получатель] WebRTC соединение установлено!');
        } else if (pc.connectionState === 'disconnected' || 
                   pc.connectionState === 'failed' || 
                   pc.connectionState === 'closed') {
          console.warn('[Получатель] WebRTC соединение закрыто или ошибка.');
          setIsConnected(false);
          setAppState(APP_STATES.CONNECTING); 
        }
      };
      pc.oniceconnectionstatechange = (event) => {
        console.log(`[Получатель] Состояние ICE соединения: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          console.log('[Получатель] ICE соединение установлено!');
        } else if (pc.iceConnectionState === 'failed') {
          console.error('[Получатель] ICE соединение не удалось.');
          setError('Ошибка установки ICE соединения.');
          setAppState(APP_STATES.ERROR);
        } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
          console.warn('[Получатель] ICE соединение закрыто.');
          setIsConnected(false);
          setAppState(APP_STATES.CONNECTING);
        }
      };
      
      pc.onicecandidateerror = (event) => {
        if (event.errorCode === 701) return;
        console.error('[Получатель] Ошибка ICE кандидата:', event.errorCode, event.errorText);
      };
    } catch (error) {
      console.error('Ошибка при подключении к комнате:', error);
      setError('Ошибка при подключении к комнате. Пожалуйста, попробуйте еще раз.');
      setAppState(APP_STATES.ERROR);
    }
  };
  const downloadFile = () => {
    if (!downloadUrl || !fileInfo) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileInfo.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  const renderContent = () => {
    switch (appState) {
      case APP_STATES.CONNECTING:
        return (
          <div className={styles.receiverContainer}>
            <div className={styles.connecting}>
              <h2>Подключение к комнате...</h2>
              <p>Пожалуйста, подождите</p>
            </div>
          </div>
        );
      
      case APP_STATES.CONNECTED:
        return (
          <div className={styles.receiverContainer}>
            <div className={styles.connected}>
              <div className={styles.icon}>✓</div>
              <h2>Соединение установлено</h2>
              <p>{isConnected ? 'Готов к получению файла' : 'Ожидание подключения отправителя...'}</p>
            </div>
          </div>
        );
      
      case APP_STATES.RECEIVING:
        return (
          <div className={styles.receiverContainer}>
            <h2>Получение файла</h2>
            
            {fileInfo && (
              <div className={styles.fileInfo}>
                <div className={styles.fileName}>{fileInfo.name}</div>
                <div className={styles.fileSize}>{formatFileSize(fileInfo.size)}</div>
              </div>
            )}
            
            <div className={styles.progressBar}>
              <div 
                className={styles.progress} 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            
            <div className={styles.transferInfo}>
              <div>{progress}% получено</div>
              <span>{formatFileSize(receivedSize)} / {fileInfo ? formatFileSize(fileInfo.size) : '0 B'}</span>
            </div>
          </div>
        );
      
      case APP_STATES.COMPLETE:
        return (
          <div className={styles.receiverContainer}>
            <div className={styles.icon}>✅</div>
            <h2>Файл успешно получен!</h2>
            
            {fileInfo && (
              <div className={styles.fileInfo}>
                <div className={styles.fileName}>{fileInfo.name}</div>
                <div className={styles.fileSize}>{formatFileSize(fileInfo.size)}</div>
              </div>
            )}
            
            <button 
              onClick={downloadFile}
              className={styles.downloadButton}
            >
              <span className={styles.icon}>⬇️</span>
              Сохранить файл
            </button>
          </div>
        );
      
      case APP_STATES.ERROR:
        return (
          <div className={styles.receiverContainer}>
            <div className={`${styles.icon} ${styles.error}`}>❌</div>
            <h2>Произошла ошибка</h2>
            {error && <p className={styles.errorMessage}>{error}</p>}
            <button 
              onClick={() => window.location.reload()}
              className={styles.newTransferButton}
            >
              Попробовать снова
            </button>
          </div>
        );
      
      default:
        return null;
    }
  };
  
  return (
    <main className={styles.home}>
      <h1 className={styles.title}>FastFile</h1>
      <p className={styles.subtitle}>Быстрая и безопасная передача файлов напрямую между браузерами</p>
      
      {renderContent()}
    </main>
  );
} 