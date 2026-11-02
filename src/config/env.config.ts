import { InvalidArgumentError } from '../common/exceptions/base.exception';

export const getStringEnvVariable = (
  key: string,
  defaultValue: string = '',
): string => {
  return process.env[key] || defaultValue;
};

export const requireEnvVariable = (
  key: string,
  value: string | undefined = process.env[key],
): string => {
  const normalized = value?.trim();

  if (!normalized) {
    throw new InvalidArgumentError(`${key} is required`);
  }

  return normalized;
};

export const getNumberEnvVariable = (
  key: string,
  defaultValue: number = 0,
): number => {
  const value = process.env[key];
  return value ? Number(value) : defaultValue;
};
