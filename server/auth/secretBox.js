// Small AES-GCM helper for secrets that must be shown again (access codes). The key is the SHA-256 of the
// ACCESS_CODE_KEY secret; a random 12-byte IV is stored in front of the ciphertext, all base64. Works in Workers and Node.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toB64 = bytes => btoa(String.fromCharCode(...bytes));
const fromB64 = text => Uint8Array.from(atob(text), ch => ch.charCodeAt(0));

const importKey = async secret => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(String(secret)));
  return globalThis.crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

const seal = async (secret, text) => {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const body = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(secret), encoder.encode(text)));
  return toB64(new Uint8Array([...iv, ...body]));
};

// Returns the text, or null when it cannot be opened (wrong key or damaged data).
const open = async (secret, blob) => {
  try {
    const bytes = fromB64(blob);
    const plain = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await importKey(secret), bytes.slice(12));
    return decoder.decode(plain);
  } catch { return null; }
};

module.exports = { seal, open };
