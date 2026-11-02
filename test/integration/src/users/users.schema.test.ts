import { Roles } from '../../../../src/common/enums/roles.enum';
import { User } from '../../../../src/users/users.schema';

const buildUser = (role: Roles, suffix: string) => ({
  email: `schema-${suffix}@example.com`,
  password: 'hash',
  role,
  verified: true,
});

describe('User schema owner constraint', () => {
  test('should allow multiple admin and user documents', async () => {
    await User.create(buildUser(Roles.ADMIN, 'admin-1'));
    await User.create(buildUser(Roles.ADMIN, 'admin-2'));
    await User.create(buildUser(Roles.USER, 'user-1'));

    assert.strictEqual(await User.countDocuments(), 3);
  });

  test('should reject a second owner', async () => {
    await User.create(buildUser(Roles.OWNER, 'owner-1'));

    await assert.rejects(
      User.create(buildUser(Roles.OWNER, 'owner-2')),
      (error: unknown) => (error as { code?: number }).code === 11000,
    );

    assert.strictEqual(await User.countDocuments({ role: Roles.OWNER }), 1);
  });

  test('should reject an unknown role', async () => {
    await assert.rejects(
      User.create({
        email: 'schema-unknown@example.com',
        password: 'hash',
        role: 'superuser' as unknown as Roles,
        verified: true,
      }),
      (error: unknown) => (error as Error).name === 'ValidationError',
    );
  });

  test('should persist a telegram chat id', async () => {
    const created = await User.create({
      ...buildUser(Roles.USER, 'telegram'),
      telegramChatId: '4242',
    });

    const stored = await User.findById(created._id);
    assert.strictEqual(stored?.telegramChatId, '4242');
  });

  test('should reject a malformed telegram chat id', async () => {
    await assert.rejects(
      User.create({
        ...buildUser(Roles.USER, 'telegram-bad'),
        telegramChatId: 'abc',
      }),
      (error: unknown) => (error as Error).name === 'ValidationError',
    );
  });

  test('should persist MFA state but hide secrets in JSON', async () => {
    const created = await User.create({
      ...buildUser(Roles.USER, 'mfa'),
      mfaEnabled: true,
      mfaSecret: 'SECRET',
      mfaRecoveryCodes: ['hash-1', 'hash-2'],
      mfaFailedAttempts: 2,
      mfaLockoutUntil: new Date(Date.now() + 60_000),
    });

    const stored = await User.findById(created._id).lean();
    assert.strictEqual(stored?.mfaEnabled, true);
    assert.strictEqual(stored?.mfaSecret, 'SECRET');
    assert.deepStrictEqual(stored?.mfaRecoveryCodes, ['hash-1', 'hash-2']);

    const json = (
      created as unknown as { toJSON(): Record<string, unknown> }
    ).toJSON();
    assert.strictEqual(json.mfaEnabled, true);
    for (const field of [
      'mfaSecret',
      'mfaPendingSecret',
      'mfaRecoveryCodes',
      'mfaFailedAttempts',
      'mfaLockoutUntil',
    ]) {
      assert.strictEqual(field in json, false);
    }
  });
});
