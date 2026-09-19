import { useState } from 'react';
import Avatar from '../../components/Avatar.jsx';
import { AVATARS } from './avatars.js';
import { fileToAvatarDataUrl } from './imageResize.js';
import styles from './AvatarPicker.module.css';

/**
 * Controlled photo/avatar picker with three sources: built-in avatars, an uploaded
 * photo (resized inline — no Firebase Storage needed), or an image URL (e.g. a public
 * Google Drive image link). Emits { avatarId, photoURL } with exactly one set.
 */
export default function AvatarPicker({ value, onChange, name }) {
  const [tab, setTab] = useState('avatars');
  const [linkInput, setLinkInput] = useState(value?.photoURL?.startsWith('http') ? value.photoURL : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chooseAvatar = (id) => onChange({ avatarId: id, photoURL: null });

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      onChange({ avatarId: null, photoURL: dataUrl });
    } catch (err) {
      setError(err.message || 'Could not process that image.');
    } finally {
      setBusy(false);
    }
  }

  function applyLink() {
    const url = linkInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setError('Enter a full image URL starting with http(s)://');
      return;
    }
    setError('');
    onChange({ avatarId: null, photoURL: url });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.preview}>
        <Avatar profile={{ ...value, name }} size={72} />
        <span className="muted">Preview</span>
      </div>

      <div className={styles.tabs} role="tablist">
        {[
          ['avatars', 'Avatars'],
          ['upload', 'Upload'],
          ['link', 'Image link'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
            onClick={() => {
              setTab(id);
              setError('');
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'avatars' && (
        <div className={styles.grid}>
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`${styles.avatarBtn} ${value?.avatarId === a.id ? styles.selected : ''}`}
              onClick={() => chooseAvatar(a.id)}
              title={a.id}
            >
              <Avatar avatarId={a.id} size={48} />
            </button>
          ))}
        </div>
      )}

      {tab === 'upload' && (
        <div className={styles.pane}>
          <label className={`btn btn-secondary ${styles.uploadBtn}`}>
            {busy ? 'Processing…' : 'Choose a photo'}
            <input type="file" accept="image/*" onChange={onFile} hidden disabled={busy} />
          </label>
          <p className="muted">Your photo is resized to a small avatar and stored with your profile.</p>
        </div>
      )}

      {tab === 'link' && (
        <div className={styles.pane}>
          <div className={styles.linkRow}>
            <input
              className="input"
              placeholder="https://…/photo.jpg"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
            />
            <button type="button" className="btn btn-secondary" onClick={applyLink}>
              Use
            </button>
          </div>
          <p className="muted">
            Paste a direct image URL. For Google Drive, use a public, direct image link.
          </p>
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
