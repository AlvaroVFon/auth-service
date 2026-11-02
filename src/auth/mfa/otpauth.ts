export interface OtpauthOptions {
  issuer: string;
  account: string;
  secret: string;
  digits?: number;
  period?: number;
}

export const buildOtpauthUrl = (options: OtpauthOptions): string => {
  const digits = options.digits ?? 6;
  const period = options.period ?? 30;
  const label = encodeURIComponent(`${options.issuer}:${options.account}`);

  return (
    `otpauth://totp/${label}` +
    `?secret=${encodeURIComponent(options.secret)}` +
    `&issuer=${encodeURIComponent(options.issuer)}` +
    `&algorithm=SHA1&digits=${digits}&period=${period}`
  );
};
