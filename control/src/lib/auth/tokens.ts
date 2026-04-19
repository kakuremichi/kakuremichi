import { createHash, randomBytes } from 'crypto';

export const TOKEN_PREFIX = 'kmt_';
const RANDOM_LENGTH = 32;

export interface GeneratedToken {
  plaintext: string;
  prefix: string;
  hash: string;
}

export function generateApiToken(): GeneratedToken {
  let random = '';
  while (random.length < RANDOM_LENGTH) {
    random += randomBytes(24).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  }
  random = random.slice(0, RANDOM_LENGTH);
  const plaintext = `${TOKEN_PREFIX}${random}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 8),
    hash: hashToken(plaintext),
  };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isValidTokenFormat(token: string): boolean {
  return token.startsWith(TOKEN_PREFIX) && token.length >= TOKEN_PREFIX.length + 16;
}
