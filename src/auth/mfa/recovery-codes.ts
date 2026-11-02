import { createHash, randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;
const GROUP_LENGTH = 5;

export const normalizeRecoveryCode = (code: string): string =>
  code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const hashRecoveryCode = (code: string): string =>
  createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');

const generateCode = (): string => {
  let raw = '';

  for (let index = 0; index < CODE_LENGTH; index++) {
    raw += ALPHABET[randomInt(0, ALPHABET.length)];
  }

  return `${raw.slice(0, GROUP_LENGTH)}-${raw.slice(GROUP_LENGTH)}`;
};

export const generateRecoveryCodes = (count: number = 10): string[] => {
  const codes = new Set<string>();

  while (codes.size < count) {
    codes.add(generateCode());
  }

  return [...codes];
};
