export type TrustProxyValue = boolean | number;

const DECIMAL_HOPS = /^\d+$/;

export const resolveTrustProxy = (
  value: string | undefined,
): TrustProxyValue => {
  const normalized = value?.trim().toLowerCase() ?? '';

  if (normalized === '') {
    return false;
  }
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  if (DECIMAL_HOPS.test(normalized)) {
    return Number(normalized);
  }

  throw new Error(
    `Invalid TRUST_PROXY value "${value}". Use true, false or a non-negative integer hop count.`,
  );
};
