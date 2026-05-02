import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY or SESSION_SECRET is required to store DNS provider credentials');
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to deterministic derivation for development secrets.
  }

  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptJson<T>(value: string): T {
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Invalid encrypted DNS provider configuration');
  }

  const iv = Buffer.from(ivRaw, 'base64url');
  const tag = Buffer.from(tagRaw, 'base64url');
  const encrypted = Buffer.from(encryptedRaw, 'base64url');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}
