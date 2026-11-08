import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import {
  createApplicationComposition,
  resolveAccessTokenTtl,
} from '../../../../src/config/application.composition';
import { GrantRoles } from '../../../../src/grants';
import { MailerInterface } from '../../../../src/libs/mailer/mailer.interface';
import { silentLogger } from '../../../mocks/logger.mock';

describe('application composition configuration', () => {
  test('uses JWT_EXPIRATION for access tokens', () => {
    const originalExpiration = process.env.JWT_EXPIRATION;
    const originalLegacyExpiration = process.env.JWT_EXPIRES_IN;

    process.env.JWT_EXPIRATION = '123';
    delete process.env.JWT_EXPIRES_IN;

    try {
      assert.strictEqual(resolveAccessTokenTtl({}), 123);
    } finally {
      if (originalExpiration === undefined) {
        delete process.env.JWT_EXPIRATION;
      } else {
        process.env.JWT_EXPIRATION = originalExpiration;
      }
      if (originalLegacyExpiration === undefined) {
        delete process.env.JWT_EXPIRES_IN;
      } else {
        process.env.JWT_EXPIRES_IN = originalLegacyExpiration;
      }
    }
  });

  test('prefers an explicit access token ttl override', () => {
    assert.strictEqual(resolveAccessTokenTtl({ jwtExpiresIn: 456 }), 456);
  });

  test('fails fast when MONGO_URI is missing', () => {
    const original = process.env.MONGO_URI;
    delete process.env.MONGO_URI;

    try {
      assert.throws(
        () =>
          createApplicationComposition({
            logger: silentLogger,
            mailer: {
              sendEmail: mock.fn(() => Promise.resolve()),
              sendMailWithTemplate: mock.fn(() => Promise.resolve()),
            } as unknown as MailerInterface,
          }),
        new InvalidArgumentError('MONGO_URI is required'),
      );
    } finally {
      if (original === undefined) {
        delete process.env.MONGO_URI;
      } else {
        process.env.MONGO_URI = original;
      }
    }
  });
});

describe('application composition wiring', () => {
  test('exposes the applications and grants services', async () => {
    const mailer = {
      sendEmail: mock.fn(() => Promise.resolve()),
      sendMailWithTemplate: mock.fn(() => Promise.resolve()),
    } as unknown as MailerInterface;

    const composition = createApplicationComposition({
      logger: silentLogger,
      mailer,
    });

    assert.ok(composition.applications);
    assert.ok(composition.grants);
    assert.ok(composition.ownerBootstrap);
    assert.ok(composition.jwtKeyring.getJwks().length >= 1);
    assert.ok(composition.applicationTokens);
    assert.ok(composition.linksModule);
    assert.ok(composition.auditModule);
    await assert.rejects(
      composition.grants.assignRole({
        userId: 'bad',
        applicationId: 'bad',
        role: GrantRoles.VIEWER,
      }),
      InvalidArgumentError,
    );
  });
});

describe('application composition settings', () => {
  test('exposes a ready settings service', () => {
    const composition = createApplicationComposition({
      logger: silentLogger,
      mailer: {
        sendEmail: mock.fn(() => Promise.resolve()),
        sendMailWithTemplate: mock.fn(() => Promise.resolve()),
      } as unknown as MailerInterface,
    });

    assert.strictEqual(
      typeof composition.settings.resolveForApplication,
      'function',
    );
    assert.strictEqual(typeof composition.settings.resolveGlobal, 'function');
    assert.strictEqual(
      typeof composition.settings.updateApplicationSettings,
      'function',
    );
  });
});
