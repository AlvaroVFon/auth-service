export type TrustProxyValue = boolean | number;

export const resolveTrustProxy = (
  value: string | undefined,
): TrustProxyValue => {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  const hops = Number(normalized);

  return Number.isInteger(hops) && hops >= 0 ? hops : false;
};
