import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToday } from '../hooks/useToday.js';
import {
  getJournalMeta,
  setJournalMeta,
  listenEntries,
  addEntry,
  deleteEntry,
} from '../features/journal/journalApi.js';
import {
  newSalt,
  deriveKey,
  encryptText,
  decryptText,
  verifyKey,
  VERIFY_TOKEN,
} from '../features/journal/crypto.js';
import { formatLongDate } from '../utils/time.js';
import styles from './Journal.module.css';

export default function Journal() {
  const { user } = useAuth();
  const { today, timezone } = useToday();
  const uid = user?.uid;
  const sessKey = `lifeos.journal.pass.${uid}`;

  const [state, setState] = useState('loading'); // loading | setup | locked | unlocked
  const [meta, setMeta] = useState(null);
  const [key, setKey] = useState(null);
  const [entries, setEntries] = useState([]);

  // Load meta + try to unlock from the session passphrase.
  useEffect(() => {
    if (!uid) return;
    (async () => {
      const m = await getJournalMeta(uid);
      setMeta(m);
      let pass = null;
      try {
        pass = sessionStorage.getItem(sessKey);
      } catch {
        /* ignore */
      }
      if (m && pass) {
        const k = await deriveKey(pass, m.salt);
        if (await verifyKey(k, m.check)) {
          setKey(k);
          setState('unlocked');
          return;
        }
      }
      setState(m ? 'locked' : 'setup');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Live entries (decrypted in memory) once unlocked.
  useEffect(() => {
    if (state !== 'unlocked' || !key || !uid) return undefined;
    const unsub = listenEntries(uid, async (raw) => {
      const out = await Promise.all(
        raw.map(async (e) => {
          let text = '🔒 (could not decrypt)';
          try {
            text = await decryptText(key, { iv: e.iv, ciphertext: e.ciphertext });
          } catch {
            /* wrong key / corrupt */
          }
          return { ...e, text };
        })
      );
      out.sort((a, b) => (b.createdAt?.seconds ?? 9e9) - (a.createdAt?.seconds ?? 9e9));
      setEntries(out);
    });
    return unsub;
  }, [state, key, uid]);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Journal</h1>
        <p className="muted">Private &amp; end-to-end encrypted · {formatLongDate(timezone)}</p>
      </header>

      {state === 'loading' && <p className="muted">Loading…</p>}

      {state === 'setup' && (
        <PassphraseForm
          mode="setup"
          onSubmit={async (pass) => {
            const salt = newSalt();
            const k = await deriveKey(pass, salt);
            const check = await encryptText(k, VERIFY_TOKEN);
            await setJournalMeta(uid, { salt, check });
            try {
              sessionStorage.setItem(sessKey, pass);
            } catch {
              /* ignore */
            }
            setKey(k);
            setMeta({ salt, check });
            setState('unlocked');
          }}
        />
      )}

      {state === 'locked' && (
        <PassphraseForm
          mode="unlock"
          onSubmit={async (pass) => {
            const k = await deriveKey(pass, meta.salt);
            if (!(await verifyKey(k, meta.check))) throw new Error('Wrong passphrase.');
            try {
              sessionStorage.setItem(sessKey, pass);
            } catch {
              /* ignore */
            }
            setKey(k);
            setState('unlocked');
          }}
        />
      )}

      {state === 'unlocked' && (
        <Unlocked
          uid={uid}
          today={today}
          keyRef={key}
          entries={entries}
          timezone={timezone}
          onLock={() => {
            try {
              sessionStorage.removeItem(sessKey);
            } catch {
              /* ignore */
            }
            setKey(null);
            setState('locked');
          }}
        />
      )}
    </div>
  );
}

function PassphraseForm({ mode, onSubmit }) {
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSetup = mode === 'setup';

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (pass.length < 6) return setError('Use at least 6 characters.');
    if (isSetup && pass !== confirm) return setError('Passphrases don’t match.');
    setBusy(true);
    try {
      await onSubmit(pass);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`card ${styles.lockCard}`} onSubmit={submit}>
      <div className={styles.lockIcon}>🔒</div>
      <h2 className={styles.lockTitle}>{isSetup ? 'Set a journal passphrase' : 'Unlock your journal'}</h2>
      <p className="muted">
        {isSetup
          ? 'Your entries are encrypted on your device with this passphrase. We never see it — and it can’t be recovered if lost.'
          : 'Enter your passphrase to decrypt your entries.'}
      </p>
      <input
        className="input"
        type="password"
        placeholder="Passphrase"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        autoFocus
      />
      {isSetup && (
        <input
          className="input"
          type="password"
          placeholder="Confirm passphrase"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      )}
      {error && <div className={styles.error}>{error}</div>}
      <button className="btn" disabled={busy}>
        {busy ? 'Working…' : isSetup ? 'Create & unlock' : 'Unlock'}
      </button>
    </form>
  );
}

const ENTRY_TYPES = [
  { id: 'morning', label: '🌅 Morning' },
  { id: 'evening', label: '🌙 Evening' },
  { id: 'note', label: '📝 Note' },
];

function Unlocked({ uid, today, keyRef, entries, timezone, onLock }) {
  const [type, setType] = useState('note');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const enc = await encryptText(keyRef, text.trim());
      await addEntry(uid, { localDate: today, type, iv: enc.iv, ciphertext: enc.ciphertext });
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className={`card ${styles.compose}`} onSubmit={add}>
        <div className={styles.typeRow}>
          {ENTRY_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${styles.typeBtn} ${type === t.id ? styles.typeOn : ''}`}
              onClick={() => setType(t.id)}
            >
              {t.label}
            </button>
          ))}
          <button type="button" className={styles.lockBtn} onClick={onLock} title="Lock journal">
            🔒 Lock
          </button>
        </div>
        <textarea
          className="input"
          rows={4}
          placeholder="Write freely — this is encrypted and only you can read it."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className={styles.composeActions}>
          <button className="btn" disabled={busy || !text.trim()}>
            {busy ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </form>

      {entries.length === 0 ? (
        <p className="muted">No entries yet. Your first reflection is a good place to start.</p>
      ) : (
        <ul className={styles.entries}>
          {entries.map((e) => (
            <li key={e.id} className="card">
              <div className={styles.entryHead}>
                <span className={styles.entryType}>
                  {ENTRY_TYPES.find((t) => t.id === e.type)?.label ?? '📝 Note'}
                </span>
                <span className="muted">{e.localDate}</span>
                <button className={styles.entryDel} onClick={() => deleteEntry(uid, e.id)} title="Delete">
                  🗑
                </button>
              </div>
              <p className={styles.entryText}>{e.text}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
