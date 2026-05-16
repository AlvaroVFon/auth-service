import type { ConfigEntry } from '../../../src/libs/config-service/config-service.interface';

export const DEFAULT_CONFIG_ENTRIES: ConfigEntry[] = [
  {
    key: 'appName',
    active: true,
    value: {
      service: 'Authentication Service',
    },
  },
  {
    key: 'appVersion',
    active: true,
    value: {
      version: '1.0.0',
    },
  },
  {
    key: 'appDescription',
    active: true,
    value: {
      description: 'Authentication service for managing users and tokens.',
    },
  },
];

export default DEFAULT_CONFIG_ENTRIES;
