import fixture from '../../fixtures/fixture';
import { User as UserInterface } from '../../../src/users/users.interface';

describe('Fixture Methods', () => {
  describe('create method', () => {
    test('should create a document with default data when no data is provided', async () => {
      const user = await fixture.create<UserInterface>('User');
      assert.strictEqual(user.email, 'defaultuser@example.com');
    });

    test('shoudl delete and create a document if the same default _id exists', async () => {
      const user1 = await fixture.create<UserInterface>('User');
      const user2 = await fixture.create<UserInterface>('User');
      assert.strictEqual(user1._id.toString(), user2._id.toString());
      assert.notStrictEqual(user1, user2);
    });

    test('should create a document with overridden data when data is provided', async () => {
      const customData = { username: 'customuser', email: 'customuser@example.com' };
      const user = await fixture.create<UserInterface>('User', customData);
      assert.strictEqual(user.username, 'customuser');
      assert.strictEqual(user.email, 'customuser@example.com');
    });
  });

  describe('createMany method', () => {
    test('should create multiple documents with default data when no data is provided', async () => {
      const users = await fixture.createMany<UserInterface>('User', [
        {
          email: 'user1@example.com',
        },
        {
          email: 'user2@example.com',
        },
      ]);

      assert.strictEqual(users.length, 2);
      assert.strictEqual(users[0].email, 'user1@example.com');
      assert.strictEqual(users[1].email, 'user2@example.com');
    });

    test('should create multiple documents with overridden data when data is provided', async () => {
      const users = await fixture.createMany<UserInterface>('User', [
        { email: 'customuser1@example.com' },
        { email: 'customuser2@example.com' },
      ]);
      assert.strictEqual(users.length, 2);
      assert.strictEqual(users[0].email, 'customuser1@example.com');
      assert.strictEqual(users[1].email, 'customuser2@example.com');
    });

    test('should handle default _id correctly when creating multiple documents', async () => {
      const users = await fixture.createMany<UserInterface>('User', [
        { email: 'user1@example.com' },
        { email: 'user2@example.com' },
      ]);
      assert.strictEqual(users.length, 2);
      assert.strictEqual(users[0].email, 'user1@example.com');
      assert.strictEqual(users[1].email, 'user2@example.com');
    });
  });

  describe('find, findOne, and findById methods', () => {
    test('should find documents based on query', async () => {
      const users = await fixture.createMany<UserInterface>('User', [
        { email: 'user1@example.com' },
        { email: 'user2@example.com' },
      ]);
      const foundUsers = await fixture.find<UserInterface>('User', {
        email: { $in: [users[0].email, users[1].email] },
      });
      assert.strictEqual(foundUsers.length, 2);
    });

    test('should find one document based on query', async () => {
      await fixture.create<UserInterface>('User', { email: 'user1@example.com' });
      const user = await fixture.findOne<UserInterface>('User', { email: 'user1@example.com' });
      assert.ok(user);
      assert.strictEqual(user!.email, 'user1@example.com');
    });

    test('should find a document by its ID', async () => {
      const createdUser = await fixture.create<UserInterface>('User', {
        email: 'user1@example.com',
      });
      const foundUser = await fixture.findById<UserInterface>('User', createdUser._id.toString());
      assert.ok(foundUser);
      assert.strictEqual(foundUser!._id.toString(), createdUser._id.toString());
    });
  });
});
