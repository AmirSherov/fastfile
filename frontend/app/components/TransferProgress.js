'use client';

import styles from '../styles/Home.module.scss';

// Функция для форматирования размера файла
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function TransferProgress({ progress, fileName, fileSize }) {
  // Вычисляем переданный объем данных
  const transferredSize = Math.floor((progress / 100) * fileSize);
  
  return (
    <div className={styles.transferProgress}>
      <h2>Передача файла</h2>
      
      <div className={styles.fileInfo}>
        <div className={styles.fileName}>{fileName}</div>
        <div className={styles.fileSize}>{formatFileSize(fileSize)}</div>
      </div>
      
      <div className={styles.progressBar}>
        <div 
          className={styles.progress} 
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      
      <div className={styles.transferInfo}>
        <span>{progress}% завершено</span>
        <span>{formatFileSize(transferredSize)} / {formatFileSize(fileSize)}</span>
      </div>
    </div>
  );
} 