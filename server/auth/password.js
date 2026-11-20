// Password hashing with PBKDF2 (WebCrypto), so it runs on Cloudflare Workers as well as Node.
// Any other stored format (the old argon2 hashes) never verifies; those accounts need a password reset.
const ITERATIONS = 100000; // the Workers maximum; do not raise it
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const PREFIX = 'pbkdf2';

const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

const derive = async (password, salt, iterations) => {
  const key = await globalThis.crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, KEY_BYTES * 8
  );
  return new Uint8Array(bits);
};

// Compares every byte, so the time taken does not reveal where two values differ.
const sameBytes = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

const hashPassword = async password => {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
};

const verifyPassword = async (stored, password) => {
  if (typeof stored !== 'string') return false;
  if (stored.startsWith(`${PREFIX}$`)) {
    const [, iterations, saltText, hashText] = stored.split('$');
    const count = Number(iterations);
    if (!Number.isInteger(count) || count < 1 || !saltText || !hashText) return false;
    const hash = await derive(password, fromBase64(saltText), count);
    return sameBytes(hash, fromBase64(hashText));
  }
  return false;
};

module.exports = { hashPassword, verifyPassword };
