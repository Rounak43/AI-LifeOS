import { useEffect, useRef, useState } from 'react';
import styles from './TimePicker.module.css';

/**
 * Alarm-style time picker. Shows a friendly trigger; clicking opens a popover with
 * scrollable Hour / Minute / AM·PM columns (like a phone alarm). Stores and emits a
 * 24-hour "HH:MM" string so the rest of the app stays consistent.
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

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

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

  function pick(part, val) {
    const next = { ...draft, [part]: val };
    setDraft(next);
    onChange(to24(next.h12, next.min, next.ampm));
  }

  function commitAndClose() {
    // Commit whatever is shown (covers the "defaults are fine, just hit Done" path).
    onChange(to24(draft.h12, draft.min, draft.ampm));
    setOpen(false);
  }

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
          <div className={styles.cols}>
            <Column items={HOURS} selected={draft.h12} format={(h) => h} onPick={(v) => pick('h12', v)} />
            <span className={styles.colon}>:</span>
            <Column items={MINUTES} selected={draft.min} format={pad} onPick={(v) => pick('min', v)} />
            <div className={styles.ampm}>
              {['AM', 'PM'].map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`${styles.ampmBtn} ${draft.ampm === a ? styles.sel : ''}`}
                  onClick={() => pick('ampm', a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className={`btn ${styles.done}`} onClick={commitAndClose}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function Column({ items, selected, format, onPick }) {
  const ref = useRef(null);
  const selRef = useRef(null);
  useEffect(() => {
    if (selRef.current) selRef.current.scrollIntoView({ block: 'center' });
  }, []);
  return (
    <div className={styles.col} ref={ref}>
      {items.map((it) => (
        <button
          key={it}
          type="button"
          ref={it === selected ? selRef : null}
          className={`${styles.cell} ${it === selected ? styles.sel : ''}`}
          onClick={() => onPick(it)}
        >
          {format(it)}
        </button>
      ))}
    </div>
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
