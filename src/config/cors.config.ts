import cors from 'cors';
import type { CorsOptions } from 'cors';

const normalizeOrigin = (origin: string): string => {
  if (origin === '*') {
    throw new Error(
      'Invalid CORS_ORIGINS entry "*": wildcard origins are not supported, list every allowed origin explicitly',
    );
  }

  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    throw new Error(
      `Invalid CORS_ORIGINS entry "${origin}": expected a full origin such as https://app.test`,
    );
  }

  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  const hasPath = url.pathname !== '/' || url.search.length > 0;
  const hasCredentials = url.username.length > 0 || url.password.length > 0;
  const hasWildcardHost = url.hostname.includes('*');

  if (!isHttp || hasPath || hasCredentials || hasWildcardHost || url.hash) {
    throw new Error(
      `Invalid CORS_ORIGINS entry "${origin}": only scheme, host and port are allowed`,
    );
  }

  return url.origin;
};

export const resolveCorsOrigins = (value: string | undefined): string[] => {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map(normalizeOrigin);

  return [...new Set(origins)];
};

export const createCorsMiddleware = (origins: string[]) => {
  const allowedOrigins = new Set(origins);
  const options: CorsOptions = {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, allowedOrigins.has(origin));
    },
    maxAge: 600,
  };

  return cors(options);
};
