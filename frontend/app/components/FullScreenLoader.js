'use client';

import styles from '../styles/Home.module.scss';

export default function FullScreenLoader({ message }) {
  return (
    <div className={styles.fullScreenLoader}>
      <div className={styles.loader}></div>
      <p className={styles.loaderMessage} dangerouslySetInnerHTML={{ __html: message }}></p>
    </div>
  );
} 