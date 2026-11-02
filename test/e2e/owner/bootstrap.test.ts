import { Application } from 'express';
import request from 'supertest';

import { CryptoService } from '../../../src/libs/crypto/crypto.service';
import { OwnerBootstrapService } from '../../../src/users/owner-bootstrap.service';
import type { User as UserInterface } from '../../../src/users/users.interface';
import { User } from '../../../src/users/users.schema';
import { UsersService } from '../../../src/users/users.service';
import fixture from '../../fixtures';
import { getTestAppInstance } from '../../utils/app';

const OWNER_EMAIL = 'owner-bootstrap@example.com';
const OWNER_PASSWORD = 'StrongOwner123!';

describe('E2E owner bootstrap', () => {
  let app: Application;
  let ownerBootstrap: OwnerBootstrapService;

  before(async () => {
    app = await getTestAppInstance();
    ownerBootstrap = new OwnerBootstrapService(
      new UsersService(User, new CryptoService()),
    );
  });

  test('should create one owner idempotently and allow it to administer the home', async () => {
    const first = await ownerBootstrap.ensureOwner(OWNER_EMAIL, OWNER_PASSWORD);
    const second = await ownerBootstrap.ensureOwner(
      OWNER_EMAIL,
      OWNER_PASSWORD,
    );

    assert.strictEqual(first.created, true);
    assert.strictEqual(second.created, false);
    assert.strictEqual(second.userId, first.userId);

    const owners = await fixture.find<UserInterface>('User', {
      email: OWNER_EMAIL,
    });
    assert.strictEqual(owners.length, 1);

    const login = await request(app)
      .post('/auth/login')
      .send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
      .expect(200);

    const created = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({
        name: 'Owner Application',
        slug: `owner-app-${Date.now()}`,
        audience: `owner-aud-${Date.now()}`,
      })
      .expect(201);

    assert.ok(created.body._id);
  });
});
