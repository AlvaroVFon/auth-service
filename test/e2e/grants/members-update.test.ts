import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { GrantRoles } from '../../../src/grants/grants.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER,
  DEFAULT_USER_PLAIN_PASSWORD,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { GrantFactory } from '../../helpers/factories/grant.factory';
import { UserFactory } from '../../helpers/factories/user.factory';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E application member updates', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );

  const createUser = (overrides: Record<string, unknown> = {}) =>
    fixture.create(
      'User',
      UserFactory.generate({
        email: generateRandomEmail('member-update+'),
        password: DEFAULT_USER.password,
        verified: true,
        ...overrides,
      }),
    );

  const grant = (userId: string, applicationId: string, role: GrantRoles) =>
    fixture.create(
      'Grant',
      GrantFactory.generate({
        userId: new Types.ObjectId(userId),
        applicationId: new Types.ObjectId(applicationId),
        role,
      }),
    );

  const createAdminToken = async (application: ApplicationInterface) => {
    const admin = await createUser();
    await grant(
      admin._id.toString(),
      application._id.toString(),
      GrantRoles.ADMIN,
    );
    const login = await request(app)
      .post('/auth/login')
      .send({
        email: admin.email,
        password: DEFAULT_USER_PLAIN_PASSWORD,
        application: application.slug,
      })
      .expect(200);

    return login.body.accessToken as string;
  };

  const auditEvents = async (event: string) => {
    const response = await request(app)
      .get('/audit-events')
      .query({ event })
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);
    return (
      Array.isArray(response.body) ? response.body : response.body.items
    ) as Array<Record<string, unknown>>;
  };

  test('AC-1: changes the role and audits member.granted', async () => {
    const application = await createApplication();
    const target = await createUser();
    await grant(
      target._id.toString(),
      application._id.toString(),
      GrantRoles.VIEWER,
    );
    const token = await createAdminToken(application);

    const response = await request(app)
      .patch(
        `/applications/${application._id.toString()}/members/${target._id.toString()}`,
      )
      .set('Authorization', bearer(token))
      .send({ role: GrantRoles.EDITOR })
      .expect(200);

    assert.strictEqual(response.body.role, GrantRoles.EDITOR);
    const events = await auditEvents('member.granted');
    assert.ok(
      events.some(
        (event) =>
          event.targetUserId === target._id.toString() &&
          event.applicationId === application._id.toString(),
      ),
    );
  });

  test('AC-2: removes the grant and audits member.revoked', async () => {
    const application = await createApplication();
    const target = await createUser();
    await grant(
      target._id.toString(),
      application._id.toString(),
      GrantRoles.VIEWER,
    );
    const token = await createAdminToken(application);

    await request(app)
      .delete(
        `/applications/${application._id.toString()}/members/${target._id.toString()}`,
      )
      .set('Authorization', bearer(token))
      .expect(204);

    const remaining = await fixture.find('Grant', {
      userId: target._id,
      applicationId: application._id,
    });
    assert.strictEqual(remaining.length, 0);
    const events = await auditEvents('member.revoked');
    assert.ok(
      events.some(
        (event) =>
          event.targetUserId === target._id.toString() &&
          event.applicationId === application._id.toString(),
      ),
    );
  });

  test('AC-3/AC-4: isolates applications, protects admins and answers 404', async () => {
    const applicationA = await createApplication();
    const applicationB = await createApplication();
    const target = await createUser();
    const adminMember = await createUser();
    await grant(
      target._id.toString(),
      applicationB._id.toString(),
      GrantRoles.VIEWER,
    );
    await grant(
      adminMember._id.toString(),
      applicationA._id.toString(),
      GrantRoles.ADMIN,
    );
    const tokenA = await createAdminToken(applicationA);
    const baseA = `/applications/${applicationA._id.toString()}/members`;

    await request(app)
      .patch(`${baseA}/${target._id.toString()}`)
      .set('Authorization', bearer(tokenA))
      .send({ role: GrantRoles.EDITOR })
      .expect(404);

    await request(app)
      .patch(`${baseA}/${adminMember._id.toString()}`)
      .set('Authorization', bearer(tokenA))
      .send({ role: GrantRoles.VIEWER })
      .expect(403);

    await request(app)
      .delete(`${baseA}/${adminMember._id.toString()}`)
      .set('Authorization', bearer(tokenA))
      .expect(403);

    await request(app)
      .delete(
        `/applications/${applicationB._id.toString()}/members/${target._id.toString()}`,
      )
      .set('Authorization', bearer(tokenA))
      .expect(403);
  });
});
