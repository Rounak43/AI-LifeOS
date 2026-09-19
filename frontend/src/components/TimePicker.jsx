import { useEffect, useRef, useState } from 'react';
import styles from './TimePicker.module.css';

/**
 * Alarm-style time picker with up/down steppers (no scrollbars). Numbers roll up and
 * down via the chevrons; stores/emits a 24-hour "HH:MM" string.
 */
const pad = (n) => String(n).padStart(2, '0');

function parse(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return { h12: null, min: null, ampm: null };
  const [H, M] = value.split(':').map(Number);
  return { h12: ((H + 11) % 12) + 1, min: M, ampm: H < 12 ? 'AM' : 'PM' };
}
function to24(h12, min, ampm) {
  let H = h12 % 12;
  if (ampm === 'PM') H += 12;
  return `${pad(H)}:${pad(min)}`;
}

export default function TimePicker({ value, onChange, placeholder = 'Pick time', ariaLabel }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const p = parse(value);
  const [draft, setDraft] = useState({ h12: p.h12 ?? 9, min: p.min ?? 0, ampm: p.ampm ?? 'AM' });

  useEffect(() => {
    if (open) {
      const q = parse(value);
      setDraft({ h12: q.h12 ?? 9, min: q.min ?? 0, ampm: q.ampm ?? 'AM' });
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => wrapRef.current && !wrapRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commit = (next) => {
    setDraft(next);
    onChange(to24(next.h12, next.min, next.ampm));
  };
  const stepHour = (d) => commit({ ...draft, h12: ((draft.h12 - 1 + d + 12) % 12) + 1 });
  const stepMin = (d) => commit({ ...draft, min: (draft.min + d + 60) % 60 });
  const setAmpm = (a) => commit({ ...draft, ampm: a });

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.trigger} ${!value ? styles.empty : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel || 'Pick a time'}
      >
        <ClockIcon />
        <span>{value || placeholder}</span>
      </button>

      {open && (
        <div className={styles.pop}>
          <div className={styles.steppers}>
            <Stepper display={pad(draft.h12)} onUp={() => stepHour(1)} onDown={() => stepHour(-1)} label="hour" />
            <span className={styles.colon}>:</span>
            <Stepper display={pad(draft.min)} onUp={() => stepMin(1)} onDown={() => stepMin(-1)} label="minute" />
            <div className={styles.ampm}>
              {['AM', 'PM'].map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`${styles.ampmBtn} ${draft.ampm === a ? styles.sel : ''}`}
                  onClick={() => setAmpm(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={`btn ${styles.done}`}
            onClick={() => {
              onChange(to24(draft.h12, draft.min, draft.ampm));
              setOpen(false);
            }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function Stepper({ display, onUp, onDown, label }) {
  return (
    <div className={styles.col}>
      <button type="button" className={styles.arrow} onClick={onUp} aria-label={`increase ${label}`}>
        <Chevron up />
      </button>
      <div className={styles.value} key={display}>
        {display}
      </div>
      <button type="button" className={styles.arrow} onClick={onDown} aria-label={`decrease ${label}`}>
        <Chevron />
      </button>
    </div>
  );
}

function Chevron({ up }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={up ? undefined : { transform: 'rotate(180deg)' }}>
      <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
