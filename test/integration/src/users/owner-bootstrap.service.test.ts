import { Roles } from '../../../../src/common/enums/roles.enum';
import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { EntityAlreadyExistsError } from '../../../../src/common/exceptions/base.exception';
import { CryptoService } from '../../../../src/libs/crypto/crypto.service';
import { OwnerBootstrapService } from '../../../../src/users/owner-bootstrap.service';
import type { User as UserInterface } from '../../../../src/users/users.interface';
import { User } from '../../../../src/users/users.schema';
import { UsersService } from '../../../../src/users/users.service';
import fixture from '../../../fixtures';
import { UserFactory } from '../../../helpers/factories/user.factory';

const OWNER_EMAIL = 'owner@example.com';
const OWNER_PASSWORD = 'StrongOwner123!';

describe('OwnerBootstrapService', () => {
  let service: OwnerBootstrapService;

  before(() => {
    service = new OwnerBootstrapService(
      new UsersService(User, new CryptoService()),
    );
  });

  test('should create one verified owner on the first run', async () => {
    const result = await service.ensureOwner(OWNER_EMAIL, OWNER_PASSWORD);

    const owner = await fixture.findOne<UserInterface>('User', {
      email: OWNER_EMAIL,
    });
    if (!owner) {
      throw new Error('Expected owner to exist');
    }
    assert.strictEqual(result.created, true);
    assert.strictEqual(result.email, OWNER_EMAIL);
    assert.strictEqual(owner.role, Roles.OWNER);
    assert.strictEqual(owner.verified, true);
    assert.notStrictEqual(owner.password, OWNER_PASSWORD);
  });

  test('should be idempotent and keep the original password', async () => {
    const first = await service.ensureOwner(OWNER_EMAIL, OWNER_PASSWORD);
    const second = await service.ensureOwner(OWNER_EMAIL, 'AnotherPass123!');

    const owners = await fixture.find('User', { role: Roles.OWNER });
    assert.strictEqual(owners.length, 1);
    assert.strictEqual(second.created, false);
    assert.strictEqual(second.userId, first.userId);

    const usersService = new UsersService(User, new CryptoService());
    const login = await usersService.verifyCredentials(
      OWNER_EMAIL,
      OWNER_PASSWORD,
    );
    assert.strictEqual(login.email, OWNER_EMAIL);
  });

  test('should reject a different owner email when one already exists', async () => {
    await service.ensureOwner(OWNER_EMAIL, OWNER_PASSWORD);

    await assert.rejects(
      service.ensureOwner('other-owner@example.com', OWNER_PASSWORD),
      InvalidArgumentError,
    );
  });

  test('should never promote an existing non-owner user', async () => {
    await fixture.create<UserInterface>(
      'User',
      UserFactory.generate({ email: OWNER_EMAIL }),
    );

    await assert.rejects(
      service.ensureOwner(OWNER_EMAIL, OWNER_PASSWORD),
      EntityAlreadyExistsError,
    );

    const user = await fixture.findOne<UserInterface>('User', {
      email: OWNER_EMAIL,
    });
    assert.strictEqual(user?.role, Roles.USER);
  });

  test('should reject a weak owner password', async () => {
    await assert.rejects(
      service.ensureOwner(OWNER_EMAIL, 'weak'),
      InvalidArgumentError,
    );
  });
});
