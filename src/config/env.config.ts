export const getStringEnvVariable = (
  key: string,
  defaultValue: string = '',
): string => {
  return process.env[key] || defaultValue;
};

export const getNumberEnvVariable = (
  key: string,
  defaultValue: number = 0,
): number => {
  const value = process.env[key];
  return value ? Number(value) : defaultValue;
};
