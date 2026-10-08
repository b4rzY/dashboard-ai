import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function encryptionKey() {
  const encoded = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!encoded) throw new Error('Falta CREDENTIAL_ENCRYPTION_KEY en el servidor');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY debe contener 32 bytes');
  return key;
}

export function encryptCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptCredential(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split('.');
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue)
    throw new Error('Credencial cifrada inválida');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
