import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { resolveOwnerCredentials } from '../../../../src/config/owner.config';

describe('resolveOwnerCredentials', () => {
  test('should return null when neither variable is set', () => {
    assert.strictEqual(resolveOwnerCredentials({}), null);
  });

  test('should trim the configured email', () => {
    assert.deepStrictEqual(
      resolveOwnerCredentials({
        OWNER_EMAIL: '  owner@example.com ',
        OWNER_PASSWORD: 'StrongOwner123!',
      }),
      { email: 'owner@example.com', password: 'StrongOwner123!' },
    );
  });

  test('should reject a half-configured pair', () => {
    assert.throws(
      () => resolveOwnerCredentials({ OWNER_EMAIL: 'owner@example.com' }),
      InvalidArgumentError,
    );
    assert.throws(
      () => resolveOwnerCredentials({ OWNER_PASSWORD: 'StrongOwner123!' }),
      InvalidArgumentError,
    );
  });
});
