import { Schema } from 'mongoose';

import { ApplicationModel } from '../../../../src/applications/applications.schema';

const SETTINGS_FIELDS = [
  'accessTokenTtl',
  'appName',
  'invitationTtlMs',
  'maxSessionsPerUser',
  'mfaPolicy',
  'refreshTokenTtl',
  'requireVerifiedEmail',
] as const;

interface SettingsPath {
  options: { required?: unknown; default?: unknown };
  schema: Schema;
}

describe('Application settings subdocument', () => {
  const settingsPath = ApplicationModel.schema.path(
    'settings',
  ) as unknown as SettingsPath;

  test('should declare the settings subdocument', () => {
    assert.ok(settingsPath?.schema, 'settings subdocument is missing');
  });

  test('should declare exactly the settings fields', () => {
    assert.deepStrictEqual(Object.keys(settingsPath.schema.paths).sort(), [
      ...SETTINGS_FIELDS,
    ]);
  });

  test('should keep every settings field optional', () => {
    for (const field of SETTINGS_FIELDS) {
      const options = settingsPath.schema.path(field)?.options ?? {};

      assert.notStrictEqual(
        options.required,
        true,
        `${field} must not be required`,
      );
    }
  });

  test('should not define a default for any settings field', () => {
    for (const field of SETTINGS_FIELDS) {
      const options = settingsPath.schema.path(field)?.options ?? {};

      assert.strictEqual(
        options.default,
        undefined,
        `${field} must not have a default`,
      );
    }
  });

  test('should keep the settings subdocument optional', () => {
    assert.notStrictEqual(settingsPath.options.required, true);
  });
});
