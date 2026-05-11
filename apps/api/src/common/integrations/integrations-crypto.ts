import * as crypto from 'crypto';

const SCRYPT_SALT = Buffer.from('external-api-integrations-v1', 'utf8');

function deriveKeyOrThrow(): Buffer {
  const secret = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(
      'INTEGRATIONS_ENCRYPTION_KEY no está definida o es demasiado corta (mínimo 16 caracteres).',
    );
  }
  return crypto.scryptSync(secret, SCRYPT_SALT, 32);
}

/** Cifra un objeto JSON (credenciales) con AES-256-GCM. Formato: base64( iv12 | tag16 | ciphertext ). */
export function encryptCredentialsPayload(plain: Record<string, unknown>): string {
  const key = deriveKeyOrThrow();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = JSON.stringify(plain);
  const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptCredentialsPayload(b64: string): Record<string, unknown> {
  const key = deriveKeyOrThrow();
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 12 + 16 + 1) {
    throw new Error('Payload cifrado inválido');
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return JSON.parse(plain) as Record<string, unknown>;
}

export function isIntegrationsEncryptionConfigured(): boolean {
  const secret = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  return Boolean(secret && secret.length >= 16);
}
