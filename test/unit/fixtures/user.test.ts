import fixture from '../../fixtures/fixture';

describe('User Fixture', () => {
  test('should create a test user with valid properties', async () => {
    const user = await fixture.createTestUser();
    assert.strictEqual(typeof user.username, 'string');
    assert.strictEqual(typeof user.email, 'string');
    assert.ok(user.username.length > 0);
    assert.ok(user.email.includes('@'));
  });

  test('should override default properties when provided', async () => {
    const customData = { username: 'customuser', email: 'customuser@example.com' };
    const user = await fixture.createTestUser(customData);
    assert.strictEqual(user.username, customData.username);
    assert.strictEqual(user.email, customData.email);
  });
});
