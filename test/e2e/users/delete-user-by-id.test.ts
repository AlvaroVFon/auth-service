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

describe('Delete User By ID E2E Test', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  test('should delete a user by ID successfully', async () => {
    const newUser = await fixture.create<User>('User', {
      email: generateRandomEmail('deleteuser'),
      password: 'Delete@1234',
    });

    const deleteResponse = await request(app)
      .delete(`/users/${newUser._id}`)
      .set('Authorization', `Bearer ${DEFAULT_ADMIN_TOKEN}`)
      .expect(204);

    const deletedUser = await fixture.findById<User>(
      'User',
      newUser._id.toString(),
    );

    assert.equal(deletedUser, null);
    assert.deepStrictEqual(deleteResponse.body, {});
  });

  test('should return 404 when deleting a non-existent user', async () => {
    const nonExistentUserId = '64b64c4f4f4f4f4f4f4f4f4f'; // Example of a valid but non-existent ObjectId

    await request(app)
      .delete(`/users/${nonExistentUserId}`)
      .set('Authorization', `Bearer ${DEFAULT_ADMIN_TOKEN}`)
      .expect(404);
  });

  test('should return 403 when a non-admin user attempts to delete a user', async () => {
    const newUser = await fixture.create<User>('User', {
      email: generateRandomEmail('deleteusernonadmin'),
      password: 'Delete@1234',
    });

    await request(app)
      .delete(`/users/${newUser._id}`)
      .set('Authorization', `Bearer ${DEFAULT_USER_TOKEN}`)
      .expect(403);
  });
});
