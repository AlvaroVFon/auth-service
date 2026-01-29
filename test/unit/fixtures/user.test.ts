import fixture from '../../fixtures/fixture';
import { User as UserInterface } from '../../../src/users/users.interface';

describe('User Fixture', () => {
  test('should create a test user with valid properties', async () => {
    const user = await fixture.create<UserInterface>('User');
    assert.strictEqual(typeof user.email, 'string');
    assert.ok(user.email.includes('@'));
  });

  test('should override default properties when provided', async () => {
    const customData = { username: 'customuser', email: 'customuser@example.com' };
    const user = await fixture.create<UserInterface>('User', customData);
    assert.strictEqual(user.username, customData.username);
    assert.strictEqual(user.email, customData.email);
  });

  test('Should create multiple users with default data', async () => {
    const users = await fixture.createMany<UserInterface>('User', [
      { email: 'user2@example.com' },
      { username: 'user3' },
      { email: 'user4@example.com', username: 'user4' },
    ]);
    assert.strictEqual(users.length, 3);
    assert.strictEqual(users[0].email, 'user2@example.com');
    assert.strictEqual(users[1].username, 'user3');
    assert.strictEqual(users[2].email, 'user4@example.com');
    assert.strictEqual(users[2].username, 'user4');
  });
});
