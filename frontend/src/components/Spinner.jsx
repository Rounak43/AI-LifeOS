import styles from './Spinner.module.css';

export default function Spinner({ label }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.spinner} />
      {label && <p className={styles.label}>{label}</p>}
    </div>
  );
}
