export const HEALTH_PATHS = ['/health', '/ready'] as const;

export const isHealthProbe = (path: string): boolean =>
  (HEALTH_PATHS as readonly string[]).includes(path);
