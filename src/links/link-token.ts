import { createHash, randomBytes } from 'node:crypto';

export const LINK_TOKEN_BYTES = 32;

export const generateLinkToken = (): string =>
  randomBytes(LINK_TOKEN_BYTES).toString('base64url');

export const hashLinkToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
