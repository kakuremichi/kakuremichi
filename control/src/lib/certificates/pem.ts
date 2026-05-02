import { decryptJson, encryptJson } from '@/lib/dns/crypto';

interface EncryptedPem {
  pem: string;
}

export function encryptPem(pem: string): string {
  return encryptJson({ pem });
}

export function decryptPem(value: string): string {
  return decryptJson<EncryptedPem>(value).pem;
}
