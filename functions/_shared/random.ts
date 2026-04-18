/**
 * Generates a cryptographically random hex string of `bytes` bytes (so
 * 2*`bytes` characters of output). Used for session tokens and magic-link
 * tokens. Backed by the platform's WebCrypto getRandomValues.
 */
export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    out += buf[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Generates a v4 UUID for account ids.
 */
export function uuid(): string {
  return crypto.randomUUID();
}
