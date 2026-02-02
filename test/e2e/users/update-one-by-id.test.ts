import { Application } from 'express';
import { getTestAppInstance } from '../../utils/app';
import request from 'supertest';
import fixture from '../../fixtures/fixture';
import { generateRandomEmail } from '../../fixtures/defaults';
import { User } from '../../../src/users/users.interface';
import {
  DEFAULT_ADMIN_TOKEN,
  DEFAULT_USER_TOKEN,
} from '../../fixtures/defaults';

describe('E2E Test - Update User By ID', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should update a user by ID', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('updateonebyid'),
      password: 'password123',
    });

    const response = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_ADMIN_TOKEN}`)
      .send({ password: 'newpassword456' })
      .expect(200);

    const updatedUser = response.body;
    assert.equal(updatedUser._id, user._id);
    assert.notEqual(updatedUser.password, user.password);
    assert.ok(updatedUser.password !== 'password123');
  });

  test('should return 404 when updating a non-existent user', async () => {
    const nonExistentUserId = '64b64c4f4f4f4f4f4f4f4f4f'; // Example of a valid but non-existent ObjectId

    await request(app)
      .patch(`/users/${nonExistentUserId}`)
      .set('Authorization', `Bearer ${DEFAULT_ADMIN_TOKEN}`)
      .send({ password: 'newpassword456' })
      .expect(404);
  });

  test('should handle empty update data', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('emptyupdatedata'),
      password: 'password123',
    });

    const response = await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_ADMIN_TOKEN}`)
      .send({})
      .expect(400);

    assert.ok(response.body.message.includes('Request body is required'));
  });

  test('should return 403 when a non-admin user attempts to update a user', async () => {
    const user = await fixture.create<User>('User', {
      email: generateRandomEmail('nonadminupdate'),
      password: 'password123',
    });

    await request(app)
      .patch(`/users/${user._id}`)
      .set('Authorization', `Bearer ${DEFAULT_USER_TOKEN}`)
      .send({ password: 'newpassword456' })
      .expect(403);
  });
});
