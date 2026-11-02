import { generateKeyPairSync } from 'node:crypto';

export const createRsaKeyPair = (
  modulusLength: number = 2048,
): { privateKey: string; publicKey: string } =>
  generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
