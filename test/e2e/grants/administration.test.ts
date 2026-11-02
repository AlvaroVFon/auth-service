import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { Grant, GrantRoles } from '../../../src/grants/grants.interface';
import { User as UserInterface } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  DEFAULT_USER_TOKEN,
} from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { GrantFactory } from '../../helpers/factories/grant.factory';
import { UserFactory } from '../../helpers/factories/user.factory';
import { signTestAccessToken } from '../../helpers/tokens';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

describe('E2E Grants administration', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );

  const createUser = () =>
    fixture.create<UserInterface>('User', UserFactory.generate());

  const grantRole = (userId: string, applicationId: string, role: GrantRoles) =>
    fixture.create<Grant>(
      'Grant',
      GrantFactory.generate({
        userId: new Types.ObjectId(userId),
        applicationId: new Types.ObjectId(applicationId),
        role,
      }),
    );

  test('should let the owner assign, read and revoke a grant', async () => {
    const application = await createApplication();
    const user = await createUser();
    const applicationId = application._id.toString();
    const userId = user._id.toString();

    const assigned = await request(app)
      .put(`/applications/${applicationId}/grants`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ userId, role: GrantRoles.VIEWER })
      .expect(200);

    assert.strictEqual(assigned.body.role, GrantRoles.VIEWER);

    const fetched = await request(app)
      .get(`/applications/${applicationId}/grants/${userId}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual(fetched.body.userId, userId);

    const list = await request(app)
      .get(`/applications/${applicationId}/grants`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(200);

    assert.strictEqual((list.body as unknown[]).length, 1);

    await request(app)
      .delete(`/applications/${applicationId}/grants/${userId}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(204);

    await request(app)
      .get(`/applications/${applicationId}/grants/${userId}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(404);
  });

  test('should let the admin of an application manage its grants', async () => {
    const application = await createApplication();
    const admin = await createUser();
    const target = await createUser();
    const applicationId = application._id.toString();
    await grantRole(admin._id.toString(), applicationId, GrantRoles.ADMIN);

    const adminToken = signTestAccessToken(admin._id.toString());

    await request(app)
      .put(`/applications/${applicationId}/grants`)
      .set('Authorization', bearer(adminToken))
      .send({ userId: target._id.toString(), role: GrantRoles.EDITOR })
      .expect(200);
  });

  test('should forbid an app admin from managing another application', async () => {
    const applicationA = await createApplication();
    const applicationB = await createApplication();
    const admin = await createUser();
    const target = await createUser();
    const adminId = admin._id.toString();
    await grantRole(adminId, applicationA._id.toString(), GrantRoles.ADMIN);

    const adminToken = signTestAccessToken(adminId);
    const otherPath = `/applications/${applicationB._id.toString()}/grants`;
    const payload = { userId: target._id.toString(), role: GrantRoles.VIEWER };

    await request(app)
      .put(otherPath)
      .set('Authorization', bearer(adminToken))
      .send(payload)
      .expect(403);

    await request(app)
      .get(otherPath)
      .set('Authorization', bearer(adminToken))
      .expect(403);

    await request(app)
      .delete(`${otherPath}/${target._id.toString()}`)
      .set('Authorization', bearer(adminToken))
      .expect(403);
  });

  test('should deny users without an admin grant', async () => {
    const application = await createApplication();
    const viewer = await createUser();
    const target = await createUser();
    const applicationId = application._id.toString();
    await grantRole(viewer._id.toString(), applicationId, GrantRoles.VIEWER);

    await request(app)
      .put(`/applications/${applicationId}/grants`)
      .set('Authorization', bearer(signTestAccessToken(viewer._id.toString())))
      .send({ userId: target._id.toString(), role: GrantRoles.VIEWER })
      .expect(403);

    await request(app)
      .put(`/applications/${applicationId}/grants`)
      .set('Authorization', bearer(DEFAULT_USER_TOKEN))
      .send({ userId: target._id.toString(), role: GrantRoles.VIEWER })
      .expect(403);
  });

  test('should revoke access immediately after the grant is removed', async () => {
    const application = await createApplication();
    const admin = await createUser();
    const target = await createUser();
    const applicationId = application._id.toString();
    const adminId = admin._id.toString();
    await grantRole(adminId, applicationId, GrantRoles.ADMIN);

    const adminToken = signTestAccessToken(adminId);
    const path = `/applications/${applicationId}/grants`;

    await request(app)
      .put(path)
      .set('Authorization', bearer(adminToken))
      .send({ userId: target._id.toString(), role: GrantRoles.VIEWER })
      .expect(200);

    await request(app)
      .delete(`${path}/${adminId}`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(204);

    await request(app)
      .put(path)
      .set('Authorization', bearer(adminToken))
      .send({ userId: target._id.toString(), role: GrantRoles.EDITOR })
      .expect(403);
  });

  test('should validate grants', async () => {
    const application = await createApplication();
    const user = await createUser();
    const applicationId = application._id.toString();
    const path = `/applications/${applicationId}/grants`;

    await request(app)
      .put(path)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ userId: user._id.toString(), role: 'superuser' })
      .expect(400);

    await request(app)
      .put(path)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .send({ userId: '64b64c4f4f4f4f4f4f4f4f4f', role: GrantRoles.VIEWER })
      .expect(404);

    await request(app)
      .delete(`${path}/64b64c4f4f4f4f4f4f4f4f4f`)
      .set('Authorization', bearer(DEFAULT_OWNER_TOKEN))
      .expect(404);
  });
});
