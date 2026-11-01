export interface DuplicateKeyError {
  code: number;
  keyPattern?: Record<string, unknown>;
}

export const isDuplicateKeyError = (
  error: unknown,
): error is DuplicateKeyError =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 11000;

export const duplicateKeyFields = (error: DuplicateKeyError): string[] =>
  Object.keys(error.keyPattern ?? {});
