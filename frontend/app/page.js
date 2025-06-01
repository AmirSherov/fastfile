'use client';

import { useState, useEffect } from 'react';
import FileUploader from './components/FileUploader';
import WaitingRoom from './components/WaitingRoom';
import TransferProgress from './components/TransferProgress';
import CompleteScreen from './components/CompleteScreen';
import FullScreenLoader from './components/FullScreenLoader';
import { API_ROUTES, getWebSocketUrl, FILE_TRANSFER_CONFIG } from './config';
import styles from './styles/Home.module.scss';

const APP_STATES = {
  UPLOAD: 'upload',     
  WAITING: 'waiting',    
  TRANSFER: 'transfer',  
  COMPLETE: 'complete',  
  ERROR: 'error'         
};

export default function Home() {
  const [appState, setAppState] = useState(APP_STATES.UPLOAD);
  const [file, setFile] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [dataChannel, setDataChannel] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReceiverReady, setIsReceiverReady] = useState(false);
  const [isServerAwake, setIsServerAwake] = useState(false);
  const [loaderMessage, setLoaderMessage] = useState(
    'Подключение к серверу...<br/>Это может занять до 40 секунд. Пожалуйста, подождите.'
  );

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 20;
    let intervalId;

    const checkServerStatus = async () => {
      attempts++;
      try {
        const response = await fetch(API_ROUTES.AWAKE_SERVER);
        if (response.ok) {
          setIsServerAwake(true);
          clearInterval(intervalId);
        } else if (attempts >= maxAttempts) {
          setError('Не удалось подключиться к серверу после нескольких попыток.');
          setAppState(APP_STATES.ERROR);
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error('Ошибка при проверке статуса сервера:', err);
        if (attempts >= maxAttempts) {
          setError('Ошибка сети при подключении к серверу.');
          setAppState(APP_STATES.ERROR);
          clearInterval(intervalId);
        }
      }
    };

    if (!isServerAwake) {
      checkServerStatus();
      intervalId = setInterval(checkServerStatus, 2000);
    }

    return () => {
      clearInterval(intervalId);
    };
  }, [isServerAwake]);

  const forceUpdateState = (state, isConnected = false) => {
    console.log(`Принудительное обновление состояния на: ${state}, isConnected: ${isConnected}`);
    setAppState(state);
    setIsConnected(isConnected);
    setTimeout(() => {
      setAppState(state);
      setIsConnected(isConnected);
    }, 100);
  };
  const createRoom = async () => {
    if (!file) return;
    
    try {
      const response = await fetch(API_ROUTES.CREATE_ROOM, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.success && data.room_id) {
        setRoomId(data.room_id);
        setAppState(APP_STATES.WAITING);
        initWebRTC(data.room_id);
      } else {
        throw new Error('Не удалось создать комнату');
      }
    } catch (err) {
      console.error('Ошибка при создании комнаты:', err);
      setError('Не удалось создать комнату. Пожалуйста, попробуйте еще раз.');
      setAppState(APP_STATES.ERROR);
    }
  };
  const initWebRTC = (roomId) => {
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
      console.log('[Отправитель] RTCPeerConnection создан.');
      setPeerConnection(pc);
      const iceCandidatesBuffer = [];
      const channel = pc.createDataChannel('fileTransfer', {
        ordered: true
      });
      
      setDataChannel(channel);
      channel.onopen = () => {
        console.log('[Отправитель] Канал данных открыт!');
        forceUpdateState(appState, true);
      };
      
      channel.onclose = () => {
        console.log('[Отправитель] Канал данных закрыт.');
        forceUpdateState(appState, false);
      };
      
      channel.onerror = (error) => {
        console.error('Ошибка канала данных:', error);
      };
      ws.onopen = () => {
        console.log('[Отправитель] WebSocket соединение установлено.');
      };
      
      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'receiver-ready-for-offer') {
            console.log('[Отправитель] Получатель готов. Создание Offer...');
            setIsReceiverReady(true);
            if (pc && pc.signalingState === 'stable') {
              pc.createOffer()
                .then(offer => {
                  return pc.setLocalDescription(offer);
                })
                .then(() => {
                  console.log('[Отправитель] LocalDescription установлен. Отправка Offer.');
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: pc.localDescription.type,
                      sdp: pc.localDescription.sdp
                    }));
                  }
                })
                .catch(err => {
                  console.error('[Отправитель] Ошибка при создании или отправке оффера:', err);
                  setError('Не удалось создать оффер. Пожалуйста, попробуйте еще раз.');
                  forceUpdateState(APP_STATES.ERROR, false);
                });
            } else {
              console.warn('[Отправитель] Либо pc не инициализирован, либо signalingState не stable, Offer не будет создан.', pc ? pc.signalingState : 'pc is null');
            }
          } else if (message.type === 'answer') {
            console.log('[Отправитель] Получен Answer. Установка RemoteDescription...');
            await pc.setRemoteDescription(new RTCSessionDescription({ type: message.type, sdp: message.sdp }));
            console.log('[Отправитель] RemoteDescription (Answer) установлен.');
            
            if (iceCandidatesBuffer.length > 0) {
              console.log(`[Отправитель] Добавляем ${iceCandidatesBuffer.length} буферизованных ICE кандидатов.`);
              for (const candidate of iceCandidatesBuffer) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                  console.error('[Отправитель] Ошибка при добавлении буферизованного ICE кандидата:', e);
                }
              }
              iceCandidatesBuffer.length = 0;
            }
          } else if (message.type === 'ice-candidate') {
            if (message.candidate) {
              if (pc.remoteDescription === null) {
                iceCandidatesBuffer.push(message.candidate);
              } else {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                } catch (e) {
                  console.error('[Отправитель] Ошибка при добавлении ICE кандидата от получателя:', e);
                }
              }
            }
          } else if (message.type === 'client-connected') {
            console.log('Получатель успешно подключился!', message);
            forceUpdateState(APP_STATES.WAITING, true);
          } else if (message.type === 'error') {
            console.error('Ошибка от сервера:', message.message);
            setError(message.message || 'Произошла ошибка на сервере');
            forceUpdateState(APP_STATES.ERROR, false);
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
      
      pc.onicecandidateerror = (event) => {
        console.error('[Отправитель] Ошибка ICE кандидата:', event.errorCode, event.errorText);
      };
      pc.onconnectionstatechange = (event) => {
        console.log(`[Отправитель] Состояние WebRTC соединения: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          forceUpdateState(APP_STATES.WAITING, true);
        } else if (pc.connectionState === 'disconnected' || 
                  pc.connectionState === 'failed' || 
                  pc.connectionState === 'closed') {
          console.warn('[Отправитель] WebRTC соединение закрыто или ошибка.');
          forceUpdateState(APP_STATES.WAITING, false);
        }
      };
      pc.oniceconnectionstatechange = (event) => {
        console.log(`[Отправитель] Состояние ICE соединения: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          forceUpdateState(APP_STATES.WAITING, true);
        } else if (pc.iceConnectionState === 'failed') {
          console.error('[Отправитель] ICE соединение не удалось.');
          forceUpdateState(APP_STATES.ERROR, false);
        } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
          console.warn('[Отправитель] ICE соединение закрыто.');
          forceUpdateState(APP_STATES.WAITING, false);
        }
      };
    } catch (error) {
      console.error('Ошибка при инициализации WebRTC:', error);
      setError('Ошибка при инициализации соединения. Пожалуйста, попробуйте еще раз.');
      setAppState(APP_STATES.ERROR);
    }
  };
  const startFileTransfer = () => {
    if (!file || !dataChannel) {
      console.error('Невозможно начать передачу: файл или канал данных не определены');
      return;
    }
    
    console.log('Начинаем передачу файла');
    console.log('Состояние канала данных:', dataChannel.readyState);
    if (dataChannel.readyState !== 'open') {
      console.log('Канал данных не открыт, ожидаем открытия...');
      const originalOnOpen = dataChannel.onopen;
      dataChannel.onopen = () => {
        if (originalOnOpen) originalOnOpen();
        
        console.log('Канал данных открыт, начинаем передачу');
        startActualTransfer();
      };
      setTimeout(() => {
        if (dataChannel.readyState === 'open') {
          console.log('Канал данных открыт по таймауту, начинаем передачу');
          startActualTransfer();
        } else {
          console.error('Канал данных не открылся за отведенное время');
          setError('Не удалось установить соединение для передачи данных');
          forceUpdateState(APP_STATES.ERROR, false);
        }
      }, 5000);
    } else {
      startActualTransfer();
    }
  };
  const startActualTransfer = () => {
    setAppState(APP_STATES.TRANSFER);
    const CHUNK_SIZE = FILE_TRANSFER_CONFIG.CHUNK_SIZE;
    const fileInfo = {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified
    };
    
    console.log('Отправляем информацию о файле:', fileInfo);
    dataChannel.send(JSON.stringify({
      type: 'file-info',
      data: fileInfo
    }));
    
    let offset = 0;
    let reader = new FileReader();
    
    const MAX_BUFFER_SIZE = FILE_TRANSFER_CONFIG.MAX_BUFFER_SIZE;
    
    let waitingForBuffer = false;
    dataChannel.onbufferedamountlow = () => {
      if (waitingForBuffer && offset < file.size) {
        console.log('Буфер освободился, продолжаем передачу...');
        waitingForBuffer = false;
        readSlice(offset);
      }
    };
    
    dataChannel.bufferedAmountLowThreshold = MAX_BUFFER_SIZE * FILE_TRANSFER_CONFIG.BUFFER_THRESHOLD_PERCENT / 100;
    
    reader.onload = (event) => {
      if (dataChannel.readyState === 'open') {
        try {
          dataChannel.send(event.target.result);
          offset += event.target.result.byteLength;
          
          const progress = Math.min(100, Math.floor((offset / file.size) * 100));
          setProgress(progress);
          
          if (offset < file.size) {
            if (dataChannel.bufferedAmount > MAX_BUFFER_SIZE) {
              console.log(`Буфер заполнен (${dataChannel.bufferedAmount} байт), ожидаем освобождения...`);
              waitingForBuffer = true;
            } else {
              if (file.size > 10 * 1024 * 1024) {
                setTimeout(() => readSlice(offset), FILE_TRANSFER_CONFIG.CHUNK_DELAY);
              } else {
                readSlice(offset);
              }
            }
          } else {
            dataChannel.send(JSON.stringify({ type: 'file-complete' }));
            setAppState(APP_STATES.COMPLETE);
          }
        } catch (error) {
          console.error('Ошибка при отправке данных:', error);
          setError(`Ошибка при отправке данных: ${error.message}`);
          setAppState(APP_STATES.ERROR);
        }
      }
    };
    
    reader.onerror = (error) => {
      console.error('Ошибка чтения файла:', error);
      setError('Ошибка при чтении файла. Пожалуйста, попробуйте еще раз.');
      setAppState(APP_STATES.ERROR);
    };
    
    const readSlice = (offset) => {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };
    
    readSlice(0);
  };
  const cancelTransfer = () => {
    if (dataChannel) {
      dataChannel.close();
    }
    
    if (peerConnection) {
      peerConnection.close();
    }
    
    setFile(null);
    setRoomId(null);
    setProgress(0);
    setError(null);
    setPeerConnection(null);
    setDataChannel(null);
    setIsConnected(false);
    setAppState(APP_STATES.UPLOAD);
  };
  const renderContent = () => {
    switch (appState) {
      case APP_STATES.UPLOAD:
        return <FileUploader 
                 onFileSelected={setFile} 
                 onSubmit={createRoom} 
                 selectedFile={file} 
               />;
      
      case APP_STATES.WAITING:
        return <WaitingRoom 
                 roomId={roomId} 
                 isConnected={isConnected}
                 onCancel={cancelTransfer}
                 onStartTransfer={startFileTransfer}
               />;
      
      case APP_STATES.TRANSFER:
        return <TransferProgress 
                 progress={progress} 
                 fileName={file?.name}
                 fileSize={file?.size}
               />;
      
      case APP_STATES.COMPLETE:
      case APP_STATES.ERROR:
        return <CompleteScreen 
                 isError={appState === APP_STATES.ERROR}
                 errorMessage={error}
                 onReset={cancelTransfer}
               />;
      
      default:
        return <FileUploader 
                 onFileSelected={setFile} 
                 onSubmit={createRoom} 
                 selectedFile={file} 
               />;
    }
  };
  
  return (
    <main className={styles.home}>
      {!isServerAwake && <FullScreenLoader message={loaderMessage} />}
      {isServerAwake && (
        <>
          <h1 className={styles.title}>FastFile</h1>
          <p className={styles.subtitle}>Быстрая и безопасная передача файлов напрямую между браузерами</p>
          {renderContent()}
        </>
      )}
    </main>
  );
}
