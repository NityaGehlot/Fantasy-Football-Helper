// app/services/pairingCode.ts
// One-time codes that link the FF Helper browser extension to your account. Shared by the app
// (which makes them) and the extension (which reads what you type). Pure code.

// No 0/O or 1/I, so codes are easy to read and type.
export const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIRING_TTL_MS = 10 * 60 * 1000;

const secureRandom = () => {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
};

/** A new 8-character code (stored without the dash). */
export function newPairingCode(rand: () => number = secureRandom): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += PAIRING_ALPHABET[Math.floor(rand() * PAIRING_ALPHABET.length)];
  return code;
}

/** "ABCDEFGH" -> "ABCD-EFGH" */
export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4, 8)}`;

/** A code as typed (any case, spaces, dash) -> the stored form, or null if it can't be a code. */
export function normalizeCode(input: string): string | null {
  const code = String(input ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== 8) return null;
  return [...code].every(c => PAIRING_ALPHABET.includes(c)) ? code : null;
}
