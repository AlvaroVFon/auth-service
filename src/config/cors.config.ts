import cors from 'cors';
import type { CorsOptions } from 'cors';

export const resolveCorsOrigins = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

export const createCorsMiddleware = (origins: string[]) => {
  const options: CorsOptions = {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, origins.includes(origin));
    },
  };

  return cors(options);
};
