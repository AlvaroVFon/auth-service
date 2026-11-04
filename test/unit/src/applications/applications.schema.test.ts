import { Schema } from 'mongoose';

import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { SETTINGS_FIELDS } from '../../../../src/settings/settings.validation';

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

  test('should declare exactly the fields of SETTINGS_FIELDS', () => {
    assert.deepStrictEqual(SETTINGS_FIELDS, [
      'accessTokenTtlSeconds',
      'refreshTokenTtlSeconds',
      'mfaPolicy',
      'maxSessionsPerUser',
      'requireVerifiedEmail',
      'invitationTtlMs',
      'appName',
    ]);
  });

  test('should keep the schema paths aligned with SETTINGS_FIELDS', () => {
    assert.deepStrictEqual(
      Object.keys(settingsPath.schema.paths).sort(),
      [...SETTINGS_FIELDS].sort(),
      'a settings field is missing from the schema (strict mode would drop it)',
    );
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

  test('should validate every settings field with a domain predicate', () => {
    for (const field of SETTINGS_FIELDS) {
      const options = settingsPath.schema.path(field)?.options ?? {};

      assert.strictEqual(
        typeof (options as { validate?: unknown }).validate,
        'object',
        `${field} must declare a validator`,
      );
    }
  });

  test('should keep the settings subdocument optional', () => {
    assert.notStrictEqual(settingsPath.options.required, true);
  });
});
