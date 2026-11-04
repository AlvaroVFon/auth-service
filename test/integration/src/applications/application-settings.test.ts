import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { MfaPolicy } from '../../../../src/settings/settings.interface';
import { ApplicationFactory } from '../../../helpers/factories/application.factory';

const isValidationError = (error: Error): boolean =>
  error.name === 'ValidationError';

describe('Application settings', () => {
  test('should persist and read back partial settings', async () => {
    const application = ApplicationFactory.generate();

    const created = await ApplicationModel.create({
      name: application.name,
      slug: application.slug,
      audience: application.audience,
      settings: {
        accessTokenTtl: 900,
        mfaPolicy: MfaPolicy.REQUIRED,
        appName: 'Billing',
      },
    });

    const stored = await ApplicationModel.findById(created._id).lean();

    assert.deepStrictEqual(stored?.settings, {
      accessTokenTtl: 900,
      mfaPolicy: MfaPolicy.REQUIRED,
      appName: 'Billing',
    });
  });

  test('should persist every supported settings field', async () => {
    const application = ApplicationFactory.generate();
    const settings = {
      accessTokenTtl: 600,
      refreshTokenTtl: 172800,
      mfaPolicy: MfaPolicy.DISABLED,
      maxSessionsPerUser: 3,
      requireVerifiedEmail: false,
      invitationTtlMs: 3600000,
      appName: 'Billing',
    };

    const created = await ApplicationModel.create({
      name: application.name,
      slug: application.slug,
      audience: application.audience,
      settings,
    });

    const stored = await ApplicationModel.findById(created._id).lean();

    assert.deepStrictEqual(stored?.settings, settings);
  });

  test('should reject an unknown settings key on a direct model write', async () => {
    const application = ApplicationFactory.generate();

    await assert.rejects(
      ApplicationModel.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
        settings: { accessTokenTTL: 900 },
      }),
      (error: Error) =>
        isValidationError(error) && error.message.includes('accessTokenTTL'),
    );

    assert.strictEqual(
      await ApplicationModel.countDocuments({ slug: application.slug }),
      0,
    );
  });

  test('should keep settings undefined when the application has none', async () => {
    const application = ApplicationFactory.generate();

    const created = await ApplicationModel.create({
      name: application.name,
      slug: application.slug,
      audience: application.audience,
    });

    await created.validate();
    assert.strictEqual(created.settings, undefined);

    const stored = await ApplicationModel.findById(created._id).lean();

    assert.strictEqual(stored?.settings, undefined);
  });

  test('should reject a negative accessTokenTtl and persist nothing', async () => {
    const application = ApplicationFactory.generate();

    await assert.rejects(
      ApplicationModel.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
        settings: { accessTokenTtl: -1 },
      }),
      isValidationError,
    );

    assert.strictEqual(
      await ApplicationModel.countDocuments({ slug: application.slug }),
      0,
    );
  });

  test('should reject a negative refreshTokenTtl', async () => {
    const application = ApplicationFactory.generate();

    await assert.rejects(
      ApplicationModel.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
        settings: { refreshTokenTtl: -1 },
      }),
      isValidationError,
    );
  });

  test('should reject a negative invitationTtlMs', async () => {
    const application = ApplicationFactory.generate();

    await assert.rejects(
      ApplicationModel.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
        settings: { invitationTtlMs: -1 },
      }),
      isValidationError,
    );
  });

  test('should reject an unknown mfaPolicy and persist nothing', async () => {
    const application = ApplicationFactory.generate();

    await assert.rejects(
      ApplicationModel.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
        settings: { mfaPolicy: 'always' as MfaPolicy },
      }),
      isValidationError,
    );

    assert.strictEqual(
      await ApplicationModel.countDocuments({ slug: application.slug }),
      0,
    );
  });

  test('should reject a zero maxSessionsPerUser and persist nothing', async () => {
    const application = ApplicationFactory.generate();

    await assert.rejects(
      ApplicationModel.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
        settings: { maxSessionsPerUser: 0 },
      }),
      isValidationError,
    );

    assert.strictEqual(
      await ApplicationModel.countDocuments({ slug: application.slug }),
      0,
    );
  });

  test('should reject a non boolean requireVerifiedEmail without coercing it', async () => {
    const application = ApplicationFactory.generate();

    await assert.rejects(
      ApplicationModel.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
        settings: { requireVerifiedEmail: 1 as unknown as boolean },
      }),
      isValidationError,
    );

    assert.strictEqual(
      await ApplicationModel.countDocuments({ slug: application.slug }),
      0,
    );
  });

  test('should reject a stringified requireVerifiedEmail', async () => {
    const application = ApplicationFactory.generate();

    await assert.rejects(
      ApplicationModel.create({
        name: application.name,
        slug: application.slug,
        audience: application.audience,
        settings: { requireVerifiedEmail: 'true' as unknown as boolean },
      }),
      isValidationError,
    );
  });
});
