import { Application } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';

import type { Application as ApplicationInterface } from '../../../src/applications/applications.interface';
import { Grant, GrantRoles } from '../../../src/grants/grants.interface';
import type { User as UserInterface } from '../../../src/users/users.interface';
import fixture from '../../fixtures';
import {
  DEFAULT_OWNER_TOKEN,
  generateRandomEmail,
} from '../../fixtures/defaults';
import { ApplicationFactory } from '../../helpers/factories/application.factory';
import { GrantFactory } from '../../helpers/factories/grant.factory';
import { signTestAccessToken } from '../../helpers/tokens';
import { getTestAppInstance } from '../../utils/app';

const bearer = (token: string) => `Bearer ${token}`;

interface MemberResponse {
  userId: string;
  email: string;
  username?: string;
  verified: boolean;
  mfaEnabled: boolean;
  role: GrantRoles;
  createdAt?: string;
  lastLoginAt?: string | null;
  [key: string]: unknown;
}

describe('E2E application members listing', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  const createApplication = () =>
    fixture.create<ApplicationInterface>(
      'Application',
      ApplicationFactory.generate(),
    );

  const createUser = (overrides: Partial<UserInterface> = {}) =>
    fixture.create<UserInterface>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('member'),
      ...overrides,
    });

  const grantRole = (userId: string, applicationId: string, role: GrantRoles) =>
    fixture.create<Grant>(
      'Grant',
      GrantFactory.generate({
        userId: new Types.ObjectId(userId),
        applicationId: new Types.ObjectId(applicationId),
        role,
      }),
    );

  const listMembers = (applicationId: string, token = DEFAULT_OWNER_TOKEN) =>
    request(app)
      .get(`/applications/${applicationId}/members`)
      .set('Authorization', bearer(token));

  test('AC-1/AC-2: returns the envelope with readable fields and no secrets', async () => {
    const application = await createApplication();
    const admin = await createUser({
      username: 'member-admin',
      verified: true,
      mfaEnabled: true,
    });
    const viewer = await createUser({ username: 'member-viewer' });
    await grantRole(
      admin._id.toString(),
      application._id.toString(),
      GrantRoles.ADMIN,
    );
    await grantRole(
      viewer._id.toString(),
      application._id.toString(),
      GrantRoles.VIEWER,
    );

    const response = await listMembers(application._id.toString()).expect(200);
    const items = response.body.items as MemberResponse[];

    assert.strictEqual(response.body.total, 2);
    assert.strictEqual(response.body.page, 1);
    assert.strictEqual(response.body.limit, 20);
    assert.strictEqual(items.length, 2);

    const adminItem = items.find(
      (item) => item.userId === admin._id.toString(),
    );
    assert.ok(adminItem);
    assert.strictEqual(adminItem?.email, admin.email);
    assert.strictEqual(adminItem?.username, 'member-admin');
    assert.strictEqual(adminItem?.verified, true);
    assert.strictEqual(adminItem?.mfaEnabled, true);
    assert.strictEqual(adminItem?.role, GrantRoles.ADMIN);
    assert.ok(adminItem?.createdAt);
    assert.strictEqual('password' in adminItem!, false);
    assert.strictEqual('mfaSecret' in adminItem!, false);
    assert.strictEqual('loginAttempts' in adminItem!, false);
  });

  test('AC-2: the app admin of the application reads the same envelope', async () => {
    const application = await createApplication();
    const appAdmin = await createUser();
    const member = await createUser();
    await grantRole(
      appAdmin._id.toString(),
      application._id.toString(),
      GrantRoles.ADMIN,
    );
    await grantRole(
      member._id.toString(),
      application._id.toString(),
      GrantRoles.EDITOR,
    );

    const response = await listMembers(
      application._id.toString(),
      signTestAccessToken(appAdmin._id.toString()),
    ).expect(200);

    assert.strictEqual(response.body.total, 2);
    assert.strictEqual(response.body.items.length, 2);
  });

  test('AC-3: another app admin and an anonymous caller are rejected', async () => {
    const application = await createApplication();
    const other = await createApplication();
    const foreignAdmin = await createUser();
    const member = await createUser();
    await grantRole(
      foreignAdmin._id.toString(),
      other._id.toString(),
      GrantRoles.ADMIN,
    );
    await grantRole(
      member._id.toString(),
      application._id.toString(),
      GrantRoles.VIEWER,
    );

    await listMembers(
      application._id.toString(),
      signTestAccessToken(foreignAdmin._id.toString()),
    ).expect(403);
    await request(app)
      .get(`/applications/${application._id.toString()}/members`)
      .expect(401);
  });

  test('AC-4: pages do not overlap or skip members and total stays stable', async () => {
    const application = await createApplication();
    const members = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
    ]);
    for (const member of members) {
      await grantRole(
        member._id.toString(),
        application._id.toString(),
        GrantRoles.VIEWER,
      );
    }

    const pageOne = await listMembers(application._id.toString())
      .query({ page: 1, limit: 2 })
      .expect(200);
    const pageTwo = await listMembers(application._id.toString())
      .query({ page: 2, limit: 2 })
      .expect(200);

    assert.strictEqual(pageOne.body.total, 3);
    assert.strictEqual(pageTwo.body.total, 3);
    const ids = [
      ...(pageOne.body.items as MemberResponse[]).map((item) => item.userId),
      ...(pageTwo.body.items as MemberResponse[]).map((item) => item.userId),
    ];
    assert.strictEqual(ids.length, 3);
    assert.strictEqual(new Set(ids).size, 3);
  });
});
