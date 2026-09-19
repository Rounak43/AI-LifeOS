/**
 * Journal encryption — genuine end-to-end AES-GCM with a key derived (PBKDF2) from a
 * passphrase the user sets. The passphrase never leaves the device and is not stored
 * in Firestore; only the salt and a verification token are. Entries are encrypted
 * before they are written (see PRIVACY.md). If the passphrase is lost, entries cannot
 * be recovered — that's the tradeoff of real E2E encryption.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();
export const VERIFY_TOKEN = 'LIFEOS_JOURNAL_OK';

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function newSalt() {
  return b64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(passphrase, saltB64) {
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations: 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return { iv: b64(iv), ciphertext: b64(ct) };
}

export async function decryptText(key, { iv, ciphertext }) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ciphertext));
  return dec.decode(pt);
}

/** Verify a derived key against the stored check token. */
export async function verifyKey(key, check) {
  try {
    return (await decryptText(key, check)) === VERIFY_TOKEN;
  } catch {
    return false;
  }
}
