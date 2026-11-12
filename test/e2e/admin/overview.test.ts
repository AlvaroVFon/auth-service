import { Application } from 'express';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import {
  AuditEvent,
  AuditResult,
  createAuditEventModel,
} from '../../../src/audit';
import type { RefreshToken } from '../../../src/auth/tokens/refresh-token.interface';
import { GrantRoles } from '../../../src/grants/grants.interface';
import { TokenTypes } from '../../../src/libs/jwt/token-types.enum';
import { LinkType, type OneTimeLink } from '../../../src/links/link.interface';
import { LinkModel } from '../../../src/links/links.schema';
import type { User as UserInterface } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER,
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { createApplicationAccess } from '../../helpers/application-access';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { UserFactory } from '../../helpers/factories/user.factory';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('E2E admin overview', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createUser = (overrides: Partial<UserInterface> = {}) =>
    fixture.create<UserInterface>(
      'User',
      UserFactory.generate({
        email: generateRandomEmail('overview+'),
        verified: true,
        ...overrides,
      }),
    );

  test('returns the aggregated counters and the calculation date', async () => {
    const now = new Date();
    const application = await fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate({ active: true }),
    );
    await fixture.createMany<UserInterface>('User', [
      UserFactory.generate({ verified: true }),
      UserFactory.generate({ verified: true }),
      UserFactory.generate({ verified: false }),
      UserFactory.generate({
        verified: true,
        lockoutUntil: new Date(now.getTime() + HOUR),
      }),
    ]);
    await fixture.createMany<ApplicationInterface>('Application', [
      ApplicationFactory.generate({ active: true }),
      ApplicationFactory.generate({ active: false }),
    ]);

    const sessionOwner = await createUser();
    await fixture.createMany<RefreshToken>('RefreshToken', [
      {
        userId: sessionOwner._id,
        jti: '11111111-1111-4111-a111-111111111111',
        audience: 'overview-audience',
        expiresAt: new Date(now.getTime() + HOUR),
        revokedAt: null,
        replacedByJti: null,
        ipAddress: null,
        userAgent: null,
        type: TokenTypes.REFRESH,
      },
      {
        userId: sessionOwner._id,
        jti: '22222222-2222-4222-a222-222222222222',
        audience: 'overview-audience',
        expiresAt: new Date(now.getTime() + HOUR),
        revokedAt: null,
        replacedByJti: null,
        ipAddress: null,
        userAgent: null,
        type: TokenTypes.REFRESH,
      },
      {
        userId: sessionOwner._id,
        jti: '33333333-3333-4333-a333-333333333333',
        audience: 'overview-audience',
        expiresAt: new Date(now.getTime() + HOUR),
        revokedAt: new Date(),
        replacedByJti: null,
        ipAddress: null,
        userAgent: null,
        type: TokenTypes.REFRESH,
      },
    ]);

    const linkBase = {
      applicationId: application._id,
      role: GrantRoles.VIEWER,
      tokenHash: 'hash',
      invalidatedAt: null,
    };
    await fixture.createMany<OneTimeLink>(LinkModel.modelName, [
      {
        ...linkBase,
        type: LinkType.INVITATION,
        tokenHash: 'pending',
        expiresAt: new Date(now.getTime() + DAY),
      },
      {
        ...linkBase,
        type: LinkType.INVITATION,
        tokenHash: 'expired',
        expiresAt: new Date(now.getTime() - DAY),
      },
      {
        ...linkBase,
        type: LinkType.INVITATION,
        tokenHash: 'used',
        expiresAt: new Date(now.getTime() + DAY),
        usedAt: new Date(),
      },
    ]);

    await createAuditEventModel().insertMany([
      {
        event: AuditEvent.LOGIN_SUCCEEDED,
        result: AuditResult.SUCCESS,
        createdAt: new Date(now.getTime() - HOUR),
      },
      {
        event: AuditEvent.LOGIN_SUCCEEDED,
        result: AuditResult.SUCCESS,
        createdAt: new Date(now.getTime() - 3 * DAY),
      },
      {
        event: AuditEvent.LOGIN_FAILED,
        result: AuditResult.FAILURE,
        createdAt: new Date(now.getTime() - 2 * HOUR),
      },
      {
        event: AuditEvent.LOGIN_FAILED,
        result: AuditResult.FAILURE,
        createdAt: new Date(now.getTime() - 10 * DAY),
      },
      {
        event: AuditEvent.LOGIN_SUCCEEDED,
        result: AuditResult.SUCCESS,
        createdAt: new Date(now.getTime() - 10 * DAY),
      },
    ]);

    const response = await request(app)
      .get('/admin/overview')
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.ok(!Number.isNaN(Date.parse(response.body.generatedAt)));
    assert.deepStrictEqual(response.body.users, {
      total: 5,
      verified: 4,
      unverified: 1,
      locked: 1,
    });
    assert.deepStrictEqual(response.body.applications, {
      total: 3,
      active: 2,
      inactive: 1,
    });
    assert.deepStrictEqual(response.body.sessions, { active: 2 });
    assert.deepStrictEqual(response.body.invitations, {
      pending: 1,
      expired: 1,
    });
    assert.deepStrictEqual(response.body.logins, {
      last24Hours: { succeeded: 1, failed: 1 },
      last7Days: { succeeded: 2, failed: 1 },
    });
  });

  test('AC-4: rejects an app admin with 403 and a missing token with 401', async () => {
    const user = await createUser({ password: DEFAULT_USER.password });
    const { application } = await createApplicationAccess(user._id.toString());
    const login = await request(app)
      .post('/auth/login')
      .send({
        email: user.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    const response = await request(app)
      .get('/admin/overview')
      .set('Authorization', bearer(login.body.accessToken as string))
      .expect(403);

    assert.strictEqual(response.body.items, undefined);
    assert.strictEqual(response.body.users, undefined);

    await request(app).get('/admin/overview').expect(401);
  });
});
