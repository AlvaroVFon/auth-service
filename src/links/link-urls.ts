const buildLink = (baseUrl: string, path: string, token: string): string => {
  const base = baseUrl.trim().replace(/\/+$/, '');

  return `${base}${path}?token=${encodeURIComponent(token)}`;
};

export const buildInvitationLink = (baseUrl: string, token: string): string =>
  buildLink(baseUrl, '/invitations/accept', token);

export const buildPasswordResetLink = (
  baseUrl: string,
  token: string,
): string => buildLink(baseUrl, '/reset-password', token);
