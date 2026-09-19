import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase.js';

/** Journal storage. Entry text is stored only as { iv, ciphertext } — never plaintext. */

function metaRef(uid) {
  return doc(db, 'users', uid, 'journalMeta', 'config');
}
function entriesCol(uid) {
  return collection(db, 'users', uid, 'journalEntries');
}

export async function getJournalMeta(uid) {
  const snap = await getDoc(metaRef(uid));
  return snap.exists() ? snap.data() : null;
}

/** Store the salt + verification token that lets us check the passphrase later. */
export function setJournalMeta(uid, { salt, check }) {
  return setDoc(metaRef(uid), { salt, check, createdAt: serverTimestamp() });
}

export function listenEntries(uid, cb, onError) {
  return onSnapshot(
    entriesCol(uid),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export function addEntry(uid, { localDate, type, iv, ciphertext }) {
  return addDoc(entriesCol(uid), {
    localDate,
    type: type ?? 'note',
    iv,
    ciphertext,
    createdAt: serverTimestamp(),
  });
}

export function deleteEntry(uid, id) {
  return deleteDoc(doc(db, 'users', uid, 'journalEntries', id));
}
