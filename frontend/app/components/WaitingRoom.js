'use client';

import React, { useEffect, useState } from 'react';
import styles from '../styles/Home.module.scss';

const WaitingRoom = ({ roomId, isConnected, onCancel, onStartTransfer }) => {
  const [copied, setCopied] = useState(false);
  const roomUrl = `${window.location.origin}/room/${roomId}`;

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopied(true);
    } catch (err) {
      console.error('Ошибка при копировании:', err);
    }
  };

  return (
    <div className={styles.waitingRoom}>
      <h2>Комната создана!</h2>
      <p>Отправьте эту ссылку получателю:</p>
      
      <div className={styles.roomLink}>
        {roomUrl}
        <button 
          className={styles.copyButton}
          onClick={copyToClipboard}
          title="Копировать ссылку"
        >
          {copied ? '✓' : '📋'}
        </button>
      </div>

      <div className={styles.status}>
        <span className={`${styles.statusDot} ${isConnected ? styles.connected : ''}`}></span>
        {isConnected ? 'Получатель подключен' : 'Ожидание подключения получателя...'}
      </div>

      <div className={styles.buttons}>
        {isConnected && (
          <button 
            className={styles.button}
            onClick={onStartTransfer}
          >
            Начать передачу
          </button>
        )}
        
        <button 
          className={`${styles.button} ${styles.cancelButton}`}
          onClick={onCancel}
        >
          Отменить
        </button>
      </div>
    </div>
  );
};

export default WaitingRoom; 