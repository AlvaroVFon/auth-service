import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { MfaPolicy } from '../../../../src/settings/settings.interface';
import { validateApplicationSettings } from '../../../../src/settings/settings.validation';

describe('validateApplicationSettings', () => {
  test('should accept a complete valid settings object', () => {
    const settings = {
      accessTokenTtl: 900,
      refreshTokenTtl: 86400,
      mfaPolicy: MfaPolicy.REQUIRED,
      maxSessionsPerUser: 5,
      requireVerifiedEmail: true,
      invitationTtlMs: 604800000,
      appName: 'Billing',
    };

    assert.deepStrictEqual(validateApplicationSettings(settings), settings);
  });

  test('should accept a partial settings object', () => {
    assert.deepStrictEqual(
      validateApplicationSettings({ appName: 'Billing' }),
      { appName: 'Billing' },
    );
  });

  test('should accept an empty object as inheritance', () => {
    assert.deepStrictEqual(validateApplicationSettings({}), {});
  });

  test('should treat absent settings as inheritance', () => {
    assert.strictEqual(validateApplicationSettings(undefined), undefined);
    assert.strictEqual(validateApplicationSettings(null), undefined);
  });

  test('should accept a zero TTL', () => {
    assert.deepStrictEqual(validateApplicationSettings({ accessTokenTtl: 0 }), {
      accessTokenTtl: 0,
    });
  });

  test('should express token TTLs in seconds and invitation TTL in ms', () => {
    const ONE_HOUR_IN_SECONDS = 60 * 60;
    const ONE_DAY_IN_SECONDS = 24 * ONE_HOUR_IN_SECONDS;
    const ONE_WEEK_IN_MILLISECONDS = 7 * ONE_DAY_IN_SECONDS * 1000;

    assert.deepStrictEqual(
      validateApplicationSettings({
        accessTokenTtl: ONE_HOUR_IN_SECONDS,
        refreshTokenTtl: ONE_DAY_IN_SECONDS,
        invitationTtlMs: ONE_WEEK_IN_MILLISECONDS,
      }),
      {
        accessTokenTtl: 3600,
        refreshTokenTtl: 86400,
        invitationTtlMs: 604800000,
      },
    );
  });

  test('should trim appName', () => {
    assert.deepStrictEqual(
      validateApplicationSettings({ appName: ' Billing ' }),
      {
        appName: 'Billing',
      },
    );
  });

  test('should reject a negative accessTokenTtl', () => {
    assert.throws(
      () => validateApplicationSettings({ accessTokenTtl: -1 }),
      new InvalidArgumentError(
        'accessTokenTtl must be a non-negative integer (seconds)',
      ),
    );
  });

  test('should reject a negative refreshTokenTtl', () => {
    assert.throws(
      () => validateApplicationSettings({ refreshTokenTtl: -3600 }),
      new InvalidArgumentError(
        'refreshTokenTtl must be a non-negative integer (seconds)',
      ),
    );
  });

  test('should reject a negative invitationTtlMs', () => {
    assert.throws(
      () => validateApplicationSettings({ invitationTtlMs: -1 }),
      new InvalidArgumentError(
        'invitationTtlMs must be a non-negative integer (milliseconds)',
      ),
    );
  });

  test('should reject a non numeric TTL', () => {
    assert.throws(
      () =>
        validateApplicationSettings({
          accessTokenTtl: 'soon' as unknown as number,
        }),
      new InvalidArgumentError(
        'accessTokenTtl must be a non-negative integer (seconds)',
      ),
    );
  });

  test('should reject a decimal TTL', () => {
    assert.throws(
      () => validateApplicationSettings({ refreshTokenTtl: 1.5 }),
      new InvalidArgumentError(
        'refreshTokenTtl must be a non-negative integer (seconds)',
      ),
    );
  });

  test('should reject an unknown mfaPolicy', () => {
    assert.throws(
      () =>
        validateApplicationSettings({
          mfaPolicy: 'always' as unknown as MfaPolicy,
        }),
      new InvalidArgumentError(
        'mfaPolicy must be one of optional, required, disabled',
      ),
    );
  });

  test('should reject a non positive maxSessionsPerUser', () => {
    for (const value of [0, -3]) {
      assert.throws(
        () => validateApplicationSettings({ maxSessionsPerUser: value }),
        new InvalidArgumentError(
          'maxSessionsPerUser must be a positive integer',
        ),
      );
    }
  });

  test('should reject a non boolean requireVerifiedEmail', () => {
    for (const value of ['yes', 1, 0]) {
      assert.throws(
        () =>
          validateApplicationSettings({
            requireVerifiedEmail: value as unknown as boolean,
          }),
        new InvalidArgumentError('requireVerifiedEmail must be a boolean'),
      );
    }
  });

  test('should reject an empty appName', () => {
    for (const value of ['', '   ']) {
      assert.throws(
        () => validateApplicationSettings({ appName: value }),
        new InvalidArgumentError('appName must be a non-empty string'),
      );
    }
  });

  test('should reject a non object settings value', () => {
    assert.throws(
      () =>
        validateApplicationSettings(
          'settings' as unknown as Record<string, never>,
        ),
      new InvalidArgumentError('settings must be an object'),
    );
  });

  test('should reject a misspelled settings key instead of dropping it', () => {
    assert.throws(
      () =>
        validateApplicationSettings({
          accessTokenTTL: 900,
        } as unknown as Record<string, never>),
      new InvalidArgumentError('settings must be an object'),
    );
  });

  test('should reject unknown keys even when known keys are valid', () => {
    assert.throws(
      () =>
        validateApplicationSettings({
          appName: 'Billing',
          unknownField: true,
        } as unknown as Record<string, never>),
      new InvalidArgumentError('settings must be an object'),
    );
  });
});
