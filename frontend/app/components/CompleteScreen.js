'use client';

import styles from '../styles/Home.module.scss';

export default function CompleteScreen({ isError, errorMessage, onReset }) {
  return (
    <div className={styles.completeScreen}>
      <div className={`${styles.icon} ${isError ? styles.error : ''}`}>
        {isError ? '❌' : '✅'}
      </div>
      
      <h2 className={styles.message}>
        {isError ? 'Произошла ошибка' : 'Передача завершена!'}
      </h2>
      
      {isError && errorMessage && (
        <p className={styles.errorMessage}>{errorMessage}</p>
      )}
      
      {!isError && (
        <p>Файл успешно передан получателю.</p>
      )}
      
      <button 
        onClick={onReset}
        className={styles.newTransferButton}
      >
        {isError ? 'Попробовать снова' : 'Отправить еще файл'}
      </button>
    </div>
  );
} 