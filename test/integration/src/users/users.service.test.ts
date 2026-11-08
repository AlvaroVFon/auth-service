import { Types } from 'mongoose';

import { AuditEvent, AuditResult, type AuditPort } from '../../../../src/audit';
import { Roles } from '../../../../src/common/enums/roles.enum';
import { ForbiddenError } from '../../../../src/common/exceptions/auth.exceptions';
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../../../src/common/exceptions/base.exception';
import type { ListQuery } from '../../../../src/common/pagination';
import { CryptoService } from '../../../../src/libs/crypto/crypto.service';
import { User as UserInterface } from '../../../../src/users/users.interface';
import type { UserSortField } from '../../../../src/users/users.port';
import { User } from '../../../../src/users/users.schema';
import { UsersService } from '../../../../src/users/users.service';
import fixture from '../../../fixtures';
import { DEFAULT_USER } from '../../../fixtures/defaults/index';
import { generateRandomEmail } from '../../../fixtures/defaults/users.default';
import { assertSingleRaceFailure } from '../../../helpers/assert-single-race-failure';
import { UserFactory } from '../../../helpers/factories/user.factory';

describe('UsersService', () => {
  let usersService: UsersService;

  before(() => {
    usersService = new UsersService(User, new CryptoService());
    usersService.setGrantsCleaner({ deleteByUser: async () => {} });
    usersService.setSessionRevoker({ revokeAll: async () => {} });
  });

  describe('UsersService Initialization', () => {
    test('should initialize UsersService with usersModel', () => {
      assert.ok(usersService);
      assert.strictEqual((usersService as any).usersModel, User);
    });
  });

  describe('UsersService Methods', () => {
    test('should count concurrent login failures without lost updates', async () => {
      const email = generateRandomEmail('attempts+');
      const user = await fixture.create<UserInterface>('User', {
        email,
        loginAttempts: 0,
        lockoutUntil: null,
      });

      await Promise.allSettled([
        usersService.verifyCredentials(email, 'wrongpassword'),
        usersService.verifyCredentials(email, 'wrongpassword'),
      ]);

      const updated = await fixture.findById<UserInterface>(
        'User',
        user._id.toString(),
      );

      assert.strictEqual(updated?.loginAttempts, 2);
    });

    test('should start a fresh attempt window when the lockout has expired', async () => {
      const email = generateRandomEmail('lockout-expired+');
      const user = await fixture.create<UserInterface>('User', {
        email,
        loginAttempts: 5,
        lockoutUntil: new Date(Date.now() - 1000),
      });

      await assert.rejects(
        usersService.verifyCredentials(email, 'wrongpassword'),
        { name: 'InvalidCredentialsError' },
      );

      const updated = await fixture.findById<UserInterface>(
        'User',
        user._id.toString(),
      );

      assert.strictEqual(updated?.loginAttempts, 1);
      assert.strictEqual(updated?.lockoutUntil, null);
    });

    test('should lock the account when a failure reaches the attempt limit', async () => {
      const email = generateRandomEmail('lockout-max+');
      const user = await fixture.create<UserInterface>('User', {
        email,
        loginAttempts: 4,
        lockoutUntil: null,
      });

      const before = Date.now();

      await assert.rejects(
        usersService.verifyCredentials(email, 'wrongpassword'),
        { name: 'InvalidCredentialsError' },
      );

      const after = Date.now();
      const updated = await fixture.findById<UserInterface>(
        'User',
        user._id.toString(),
      );

      assert.strictEqual(updated?.loginAttempts, 5);
      assert.ok(updated?.lockoutUntil);

      const lockoutUntil = updated!.lockoutUntil!.getTime();
      assert.ok(lockoutUntil >= before + 900000 - 1000);
      assert.ok(lockoutUntil <= after + 900000 + 1000);
    });

    describe('Create()', () => {
      test('should create a new user with a hashed password', async () => {
        const plainPassword = 'securepassword123';

        const userData: Partial<UserInterface> = UserFactory.generate({
          email: generateRandomEmail('create+'),
          password: plainPassword,
        });
        const newUser = await usersService.create(userData);
        assert.ok(newUser);
        assert.strictEqual(newUser.email, userData.email);
        assert.strictEqual(newUser.username, userData.username);
        assert.notStrictEqual(newUser.password, plainPassword);
        assert.ok(
          await new CryptoService().compareString(
            plainPassword,
            newUser.password,
          ),
        );

        const foundUser = await fixture.findById<UserInterface>(
          'User',
          // @ts-expect-error newUser._id exists
          newUser._id,
        );

        assert.ok(foundUser);
        assert.strictEqual(foundUser!.email, userData.email);
        assert.strictEqual(foundUser!.username, userData.username);
        assert.strictEqual(foundUser?.password, newUser.password);
      });

      test('should default users created by admins to verified', async () => {
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: generateRandomEmail('create-verified+'),
          password: 'securepassword123',
        });
        delete userData.verified;

        const newUser = await usersService.create(userData);

        assert.strictEqual(newUser.verified, true);
      });

      test('should throw an error when creating a user with missing required fields', async () => {
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: undefined as unknown as string,
        });
        await assert.rejects(
          async () => {
            await usersService.create(userData);
          },
          (error: Error) => {
            assert.ok(error);
            assert.ok(error instanceof InvalidArgumentError);
            assert.ok(
              (error as InvalidArgumentError).name === 'InvalidArgumentError',
            );
            assert.strictEqual(
              (error as InvalidArgumentError).message,
              'Email is required to create a user',
            );
            return true;
          },
        );
      });

      test('should throw an error when creating a user with invalid email format', async () => {
        const plainPassword = 'securepassword123';
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: 'invalid-email-format',
          password: plainPassword,
        });
        await assert.rejects(
          async () => {
            await usersService.create(userData);
          },
          (error: Error) => {
            assert.ok(error);
            assert.ok(error instanceof InvalidArgumentError);
            assert.ok(
              (error as InvalidArgumentError).name === 'InvalidArgumentError',
            );
            assert.strictEqual(
              (error as InvalidArgumentError).message,
              'Invalid email format',
            );
            return true;
          },
        );
      });

      test('should return an error if user with the same email already exists', async () => {
        const email = generateRandomEmail('duplicate+');

        const userData1: Partial<UserInterface> = UserFactory.generate({
          email,
          username: 'firstuser',
          password: 'hashedpassword123',
        });
        const userData2: Partial<UserInterface> = UserFactory.generate({
          email,
          username: 'seconduser',
          password: 'hashedpassword123',
        });

        const firstUser = await usersService.create(userData1);
        assert.ok(firstUser);
        assert.strictEqual(firstUser.email, userData1.email);

        await assert.rejects(
          async () => {
            await usersService.create(userData2);
          },
          (error: Error) => {
            assert.ok(error);
            assert.ok(error instanceof EntityAlreadyExistsError);
            assert.ok(
              (error as EntityAlreadyExistsError).name ===
                'EntityAlreadyExistsError',
            );
            assert.strictEqual(
              (error as EntityAlreadyExistsError).message,
              'Email already exists',
            );
            return true;
          },
        );
      });

      test('should create a user with only required fields', async () => {
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: generateRandomEmail('requiredonly+'),
          password: 'hashedpassword123',
        });

        const newUser = await usersService.create(userData);
        assert.ok(newUser);
        assert.strictEqual(newUser.email, userData.email);

        const foundUser = await fixture.findById<UserInterface>(
          'User',
          // @ts-expect-error newUser._id exists
          newUser._id,
        );
        assert.ok(foundUser);
        assert.strictEqual(foundUser!.email, userData.email);
      });

      test('should create a user with all fields provided', async () => {
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: generateRandomEmail('allfields+'),
          username: 'allfieldsuser',
          password: 'hashedpassword123',
        });

        const newUser = await usersService.create(userData);
        assert.ok(newUser);

        const foundUser = await fixture.findById<UserInterface>(
          'User',
          // @ts-expect-error newUser._id exists
          newUser._id,
        );
        assert.ok(foundUser);
        assert.strictEqual(foundUser!.email, userData.email);
        assert.strictEqual(foundUser!.username, userData.username);
      });
    });

    describe('createVerifiedUser()', () => {
      test('should map a concurrent duplicate email to a domain error', async () => {
        const email = generateRandomEmail('verified-race+');
        const passwordHash = await new CryptoService().hashString(
          'ValidPass123!',
        );

        const results = await Promise.allSettled([
          usersService.createVerifiedUser({ email, passwordHash }),
          usersService.createVerifiedUser({ email, passwordHash }),
        ]);

        assertSingleRaceFailure(
          results,
          EntityAlreadyExistsError,
          'Email already exists',
        );

        const users = await fixture.find<UserInterface>('User', { email });
        assert.strictEqual(users.length, 1);
      });
    });

    describe('FindByEmail()', () => {
      beforeEach(async () => {
        await fixture.create<UserInterface>('User', DEFAULT_USER);
      });

      test('should find a user by email', async () => {
        const foundUser = await usersService.findByEmail(DEFAULT_USER.email);
        assert.ok(foundUser);
        assert.strictEqual(foundUser!.email, DEFAULT_USER.email);
        assert.strictEqual(
          foundUser!._id.toString(),
          DEFAULT_USER._id.toString(),
        );
      });

      test('should return null if user with email does not exist', async () => {
        const foundUser = await usersService.findByEmail(
          'nonexistent@example.com',
        );
        assert.strictEqual(foundUser, null);
      });

      test('should throw an error when email is invalid', async () => {
        await assert.rejects(
          async () => {
            await usersService.findByEmail('invalid-email-format');
          },
          (error: Error) => {
            assert.ok(error);
            assert.ok(error instanceof InvalidArgumentError);
            assert.ok(
              (error as InvalidArgumentError).name === 'InvalidArgumentError',
            );
            assert.strictEqual(
              (error as InvalidArgumentError).message,
              'Invalid email format',
            );
            return true;
          },
        );
      });

      test('should throw an error when email is not provided', async () => {
        await assert.rejects(
          async () => {
            // @ts-expect-error null email
            await usersService.findByEmail(null);
          },
          (error: Error) => {
            assert.ok(error);
            assert.ok(error instanceof InvalidArgumentError);
            assert.ok(
              (error as InvalidArgumentError).name === 'InvalidArgumentError',
            );
            assert.strictEqual(
              (error as InvalidArgumentError).message,
              'Email is required',
            );
            return true;
          },
        );
      });
    });

    describe('FindById()', () => {
      test('should throw an error on missing id', async () => {
        await assert.rejects(
          async () => {
            // @ts-expect-error null id
            await usersService.findById(null);
          },
          (error: Error) => {
            assert.ok(error);
            assert.ok(error instanceof InvalidArgumentError);
            assert.ok(
              (error as InvalidArgumentError).name === 'InvalidArgumentError',
            );
            assert.strictEqual(
              (error as InvalidArgumentError).message,
              'ID is required',
            );
            return true;
          },
        );
      });

      test('should throw an error if id is not a valid ObjectId', async () => {
        await assert.rejects(
          async () => {
            await usersService.findById('invalid-object-id');
          },
          (error: Error) => {
            assert.ok(error);
            assert.ok(error instanceof InvalidArgumentError);
            assert.ok(
              (error as InvalidArgumentError).name === 'InvalidArgumentError',
            );
            assert.strictEqual(
              (error as InvalidArgumentError).message,
              'Invalid ID format',
            );
            return true;
          },
        );
      });

      test('should find a user by id', async () => {
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: generateRandomEmail('findbyid+'),
          username: 'findbyiduser',
          password: 'hashedpassword123',
        });
        const newUser = await usersService.create(userData);

        const foundUser = await usersService.findById(newUser._id.toString());
        assert.ok(foundUser);
        assert.strictEqual(foundUser!._id.toString(), newUser._id.toString());
        assert.strictEqual(foundUser!.email, newUser.email);
        assert.strictEqual(foundUser!.username, newUser.username);
      });

      test('should return null when the user does not exist', async () => {
        const foundUser = await usersService.findById(
          new Types.ObjectId().toString(),
        );

        assert.strictEqual(foundUser, null);
      });
    });

    describe('FindAll()', () => {
      const query = (
        overrides: Partial<ListQuery<UserSortField>> = {},
      ): ListQuery<UserSortField> => ({
        page: 1,
        limit: 20,
        sort: { field: 'createdAt', direction: -1 },
        ...overrides,
      });

      test('should return an empty page if no users exist', async () => {
        const result = await usersService.findAll(query());

        assert.deepStrictEqual(result.items, []);
        assert.strictEqual(result.total, 0);
        assert.strictEqual(result.page, 1);
        assert.strictEqual(result.limit, 20);
      });

      test('should paginate the users and report the total', async () => {
        const users = await fixture.createMany<UserInterface>('User', [
          {
            email: generateRandomEmail('findall1+'),
            username: 'findalluser1',
            password: 'hashedpassword123',
          },
          {
            email: generateRandomEmail('findall2+'),
            username: 'findalluser2',
            password: 'hashedpassword123',
          },
          {
            email: generateRandomEmail('findall3+'),
            username: 'findalluser3',
            password: 'hashedpassword123',
          },
        ]);

        const firstPage = await usersService.findAll(
          query({ page: 1, limit: 2 }),
        );
        assert.strictEqual(firstPage.items.length, 2);
        assert.strictEqual(firstPage.total, users.length);
        assert.strictEqual(firstPage.page, 1);
        assert.strictEqual(firstPage.limit, 2);

        const secondPage = await usersService.findAll(
          query({ page: 2, limit: 2 }),
        );
        assert.strictEqual(secondPage.items.length, 1);
        assert.strictEqual(secondPage.total, users.length);
        assert.strictEqual(secondPage.page, 2);

        const ids = [...firstPage.items, ...secondPage.items].map((user) =>
          user._id.toString(),
        );
        assert.deepStrictEqual(
          [...new Set(ids)].sort(),
          users.map((user) => user._id.toString()).sort(),
        );
      });

      test('should filter by email or username prefix and reflect it in the total', async () => {
        await fixture.createMany<UserInterface>('User', [
          {
            email: generateRandomEmail('alice+'),
            username: 'alice-user',
            password: 'hashedpassword123',
          },
          {
            email: generateRandomEmail('bob+'),
            username: 'ali-baba',
            password: 'hashedpassword123',
          },
          {
            email: generateRandomEmail('carol+'),
            username: 'carol-user',
            password: 'hashedpassword123',
          },
        ]);

        const byEmail = await usersService.findAll(query({ q: 'alice' }));
        assert.strictEqual(byEmail.total, 1);
        assert.match(byEmail.items[0]!.email, /^alice/);

        const byUsername = await usersService.findAll(query({ q: 'ali' }));
        assert.strictEqual(byUsername.total, 2);
        assert.deepStrictEqual(
          byUsername.items
            .map((user) => user.username)
            .sort((a, b) => (a ?? '').localeCompare(b ?? '')),
          ['ali-baba', 'alice-user'],
        );
      });

      test('should treat the search term literally', async () => {
        await fixture.create<UserInterface>('User', {
          email: generateRandomEmail('literal+'),
          username: 'literal-user',
          password: 'hashedpassword123',
        });

        const result = await usersService.findAll(query({ q: '.*' }));

        assert.strictEqual(result.total, 0);
        assert.deepStrictEqual(result.items, []);
      });

      test('should order by the requested field and hide secrets', async () => {
        await fixture.createMany<UserInterface>('User', [
          {
            email: generateRandomEmail('zeta+'),
            username: 'zeta-user',
            password: 'hashedpassword123',
          },
          {
            email: generateRandomEmail('alpha+'),
            username: 'alpha-user',
            password: 'hashedpassword123',
          },
        ]);

        const result = await usersService.findAll(
          query({ sort: { field: 'email', direction: 1 } }),
        );

        assert.deepStrictEqual(
          result.items.map((user) => user.username),
          ['alpha-user', 'zeta-user'],
        );
        for (const user of result.items) {
          assert.strictEqual('password' in user, false);
          assert.strictEqual('loginAttempts' in user, false);
          assert.strictEqual('lockoutUntil' in user, false);
          assert.strictEqual('mfaSecret' in user, false);
        }
      });
    });

    describe('updateOneById()', () => {
      test('should throw an error on missing id', async () => {
        await assert.rejects(
          async () => {
            // @ts-expect-error null id
            await usersService.updateOneById(null, { username: 'newusername' });
          },
          (error: Error) => {
            assert.ok(error);
            assert.ok(error instanceof InvalidArgumentError);
            assert.ok(
              (error as InvalidArgumentError).name === 'InvalidArgumentError',
            );
            assert.strictEqual(
              (error as InvalidArgumentError).message,
              'ID is required',
            );
            return true;
          },
        );
      });

      test('should throw an error if id is not a valid ObjectId', async () => {
        await assert.rejects(
          async () => {
            await usersService.updateOneById('invalid-object-id', {
              username: 'newusername',
            });
          },
          (error: Error) => {
            assert.ok(error);
            assert.ok(error instanceof InvalidArgumentError);
            assert.ok(
              (error as InvalidArgumentError).name === 'InvalidArgumentError',
            );
            assert.strictEqual(
              (error as InvalidArgumentError).message,
              'Invalid ID format',
            );
            return true;
          },
        );
      });

      test('should update a user by id', async () => {
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: generateRandomEmail('updateone+'),
          username: 'updateoneuser',
          password: 'hashedpassword123',
        });
        const newUser = await usersService.create(userData);

        const updatedData: Partial<UserInterface> = {
          username: 'updatedusername',
        };

        const updatedUser = await usersService.updateOneById(
          newUser._id.toString(),
          updatedData,
        );
        assert.ok(updatedUser);
        assert.strictEqual(updatedUser!._id.toString(), newUser._id.toString());
        assert.strictEqual(updatedUser!.username, updatedData.username);
        assert.strictEqual(updatedUser!.email, newUser.email);
      });

      test('should revoke the sessions of the user after a password change', async () => {
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: generateRandomEmail('revokesessions+'),
          password: 'hashedpassword123',
        });
        const newUser = await usersService.create(userData);
        const revoked: string[] = [];
        usersService.setSessionRevoker({
          revokeAll: async (id) => {
            revoked.push(id);
          },
        });

        await usersService.updateOneById(newUser._id.toString(), {
          password: 'NewStrongPassword456!',
        });

        assert.deepStrictEqual(revoked, [newUser._id.toString()]);
      });

      test('should not revoke sessions when only profile fields change', async () => {
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: generateRandomEmail('keepsesions+'),
          password: 'hashedpassword123',
        });
        const newUser = await usersService.create(userData);
        const revoked: string[] = [];
        usersService.setSessionRevoker({
          revokeAll: async (id) => {
            revoked.push(id);
          },
        });

        await usersService.updateOneById(newUser._id.toString(), {
          username: 'renameduser',
        });

        assert.deepStrictEqual(revoked, []);
      });

      test('should return null when updating a non-existent user', async () => {
        const nonExistentId = '60d21b4667d0d8992e610c85'; // Example of a valid but non-existent ObjectId
        await assert.rejects(
          async () => {
            await usersService.updateOneById(nonExistentId, {
              username: 'newusername',
            });
          },
          (error: any) => {
            assert.ok(error instanceof EntityNotFoundError);
            assert.strictEqual(error.name, 'EntityNotFoundError');
            assert.strictEqual(error.message, 'User not found');
            return true;
          },
        );
      });

      test('should update only provided fields', async () => {
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: generateRandomEmail('partialupdate+'),
          username: 'partialupdateuser',
          password: 'hashedpassword123',
        });
        const newUser = await usersService.create(userData);
        const updatedData: Partial<UserInterface> = {
          username: 'partiallyupdatedusername',
        };

        const updatedUser = await usersService.updateOneById(
          newUser._id.toString(),
          updatedData,
        );
        assert.ok(updatedUser);
        assert.strictEqual(updatedUser!._id.toString(), newUser._id.toString());
        assert.strictEqual(updatedUser!.username, updatedData.username);
        assert.strictEqual(updatedUser!.email, newUser.email);
      });

      test('should hash password when updating it', async () => {
        const plainPassword = 'securepassword123';
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: generateRandomEmail('updatepassword+'),
          username: 'updatepassworduser',
          password: plainPassword,
        });
        const newUser = await usersService.create(userData);

        const updatedPlainPassword = 'newplainpassword456';
        const updatedData: Partial<UserInterface> = {
          password: updatedPlainPassword,
        };

        const updatedUser = await usersService.updateOneById(
          newUser._id.toString(),
          updatedData,
        );
        assert.ok(updatedUser);
        assert.strictEqual(updatedUser!._id.toString(), newUser._id.toString());
        assert.notStrictEqual(updatedUser!.password, plainPassword);

        const isPasswordMatch = await new CryptoService().compareString(
          updatedPlainPassword,
          updatedUser!.password,
        );
        assert.ok(isPasswordMatch);
      });

      test('should reject an empty password instead of storing it', async () => {
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: generateRandomEmail('updateemptypassword+'),
          password: 'securepassword123',
        });
        const newUser = await usersService.create(userData);

        await assert.rejects(
          usersService.updateOneById(newUser._id.toString(), { password: '' }),
          (error: Error) =>
            error instanceof InvalidArgumentError &&
            error.message === 'Password must not be empty',
        );

        const stored = await fixture.findById<UserInterface>(
          'User',
          newUser._id.toString(),
        );
        assert.strictEqual(stored?.password, newUser.password);
      });

      test('should map a duplicate email to EntityAlreadyExistsError', async () => {
        const firstUser = await usersService.create({
          email: generateRandomEmail('updateemailowner+'),
          password: 'securepassword123',
        });
        const secondUser = await usersService.create({
          email: generateRandomEmail('updateemailtaken+'),
          password: 'securepassword123',
        });

        await assert.rejects(
          usersService.updateOneById(secondUser._id.toString(), {
            email: firstUser.email,
          }),
          (error: Error) =>
            error instanceof EntityAlreadyExistsError &&
            error.message === 'Email already exists',
        );

        const stored = await fixture.findById<UserInterface>(
          'User',
          secondUser._id.toString(),
        );
        assert.strictEqual(stored?.email, secondUser.email);
      });
    });

    describe('deleteOneById()', () => {
      test('should throw an error on missing id', async () => {
        await assert.rejects(
          async () => {
            // @ts-expect-error null id
            await usersService.deleteOneById(null);
          },
          (error: Error) => {
            assert.ok(error);
            assert.ok(error instanceof InvalidArgumentError);
            assert.ok(
              (error as InvalidArgumentError).name === 'InvalidArgumentError',
            );
            assert.strictEqual(
              (error as InvalidArgumentError).message,
              'ID is required',
            );
            return true;
          },
        );
      });

      test('should throw an error if id is not a valid ObjectId', async () => {
        try {
          await usersService.deleteOneById('invalid-object-id');
          throw new Error(
            'Expected deleteOneById to throw an error due to invalid ObjectId',
          );
        } catch (error) {
          assert.ok(error);
          assert.ok(error instanceof InvalidArgumentError);
          assert.ok(
            (error as InvalidArgumentError).name === 'InvalidArgumentError',
          );
          assert.strictEqual(
            (error as InvalidArgumentError).message,
            'Invalid ID format',
          );
        }
      });

      test('should reject deleting the owner', async () => {
        const owner = await usersService.createOwner(
          'owner-delete@example.com',
          'StrongOwner123!',
        );

        await assert.rejects(
          usersService.deleteOneById(owner._id.toString()),
          ForbiddenError,
        );

        const stillThere = await fixture.findById<UserInterface>(
          'User',
          owner._id.toString(),
        );
        assert.ok(stillThere);
        assert.strictEqual(stillThere?.role, Roles.OWNER);
      });

      test('should refuse to rotate a password when no session revoker is configured', async () => {
        const unconfigured = new UsersService(User, new CryptoService());
        const user = await fixture.create<UserInterface>(
          'User',
          UserFactory.generate(),
        );

        await assert.rejects(
          unconfigured.updateOneById(user._id.toString(), {
            password: 'NewStrongPassword456!',
          }),
          /Session revoker is not configured/,
        );

        const stillThere = await fixture.findById<UserInterface>(
          'User',
          user._id.toString(),
        );
        assert.ok(stillThere);
        assert.strictEqual(stillThere?.password, user.password);
      });

      test('should refuse to delete when no grants cleaner is configured', async () => {
        const unconfigured = new UsersService(User, new CryptoService());
        const user = await fixture.create<UserInterface>(
          'User',
          UserFactory.generate(),
        );

        await assert.rejects(
          unconfigured.deleteOneById(user._id.toString()),
          /grants cleaner is not configured/,
        );

        const stillThere = await fixture.findById<UserInterface>(
          'User',
          user._id.toString(),
        );
        assert.ok(stillThere);
      });

      test('should delete a user by id', async () => {
        const userData: Partial<UserInterface> = UserFactory.generate({
          email: generateRandomEmail('deleteone+'),
          username: 'deleteoneuser',
          password: 'hashedpassword123',
        });
        const newUser = await usersService.create(userData);

        const deletedUser = await usersService.deleteOneById(
          newUser._id.toString(),
        );
        assert.ok(deletedUser);
        assert.strictEqual(deletedUser!._id.toString(), newUser._id.toString());
      });
    });
  });
});

describe('UsersService email normalization', () => {
  let usersService: UsersService;

  before(() => {
    usersService = new UsersService(User, new CryptoService());
  });

  test('should store the email trimmed and lowercased', async () => {
    const user = await usersService.create({
      email: '  Ana@Example.COM ',
      password: 'StrongPassword123!',
    });

    assert.strictEqual(user.email, 'ana@example.com');
  });

  test('should find a user regardless of email casing', async () => {
    await usersService.create({
      email: 'ana@example.com',
      password: 'StrongPassword123!',
    });

    const found = await usersService.findByEmail('ANA@EXAMPLE.COM');

    assert.ok(found);
    assert.strictEqual(found!.email, 'ana@example.com');
  });

  test('should not mutate the caller input', async () => {
    const data = {
      email: '  Ana@Example.COM ',
      password: 'StrongPassword123!',
    };

    await usersService.create(data);

    assert.strictEqual(data.email, '  Ana@Example.COM ');
    assert.strictEqual(data.password, 'StrongPassword123!');
  });

  test('should not create two users with the same email in different casing', async () => {
    await usersService.create({
      email: 'ana@example.com',
      password: 'StrongPassword123!',
    });

    await assert.rejects(
      usersService.create({
        email: 'ANA@EXAMPLE.COM',
        password: 'StrongPassword123!',
      }),
      new EntityAlreadyExistsError('Email already exists'),
    );
  });
});

describe('UsersService support actions', () => {
  const buildService = (record: ReturnType<typeof mock.fn>) => {
    const audit = { record } satisfies Pick<AuditPort, 'record'>;

    return new UsersService(
      User,
      new CryptoService(),
      5,
      900000,
      undefined,
      audit as AuditPort,
    );
  };

  const createBlockedUser = () =>
    fixture.create<UserInterface>('User', {
      email: generateRandomEmail('support+'),
      password: 'hashedpassword123',
      verified: false,
      loginAttempts: 5,
      lockoutUntil: new Date(Date.now() + 60_000),
      mfaFailedAttempts: 3,
      mfaLockoutUntil: new Date(Date.now() + 60_000),
    });

  test('unlock clears every lockout counter and audits the action', async () => {
    const record = mock.fn(async () => {});
    const user = await createBlockedUser();
    const service = buildService(record);

    const unlocked = await service.unlock(user._id.toString(), {
      actorId: DEFAULT_USER._id.toString(),
      ipAddress: '127.0.0.1',
      userAgent: 'integration-test',
    });

    assert.strictEqual(unlocked.loginAttempts, 0);
    assert.strictEqual(unlocked.lockoutUntil, null);
    assert.strictEqual(unlocked.mfaFailedAttempts, 0);
    assert.strictEqual(unlocked.mfaLockoutUntil, null);
    assert.strictEqual(record.mock.callCount(), 1);
    assert.deepStrictEqual(record.mock.calls[0]?.arguments[0], {
      event: AuditEvent.USER_UNLOCKED,
      result: AuditResult.SUCCESS,
      targetUserId: user._id.toString(),
      actorId: DEFAULT_USER._id.toString(),
      ipAddress: '127.0.0.1',
      userAgent: 'integration-test',
    });
  });

  test('unlock answers 404 for the owner and for an unknown id', async () => {
    const record = mock.fn(async () => {});
    const service = buildService(record);
    const owner = await fixture.create<UserInterface>('User', {
      email: generateRandomEmail('owner+'),
      role: Roles.OWNER,
      password: 'hashedpassword123',
      verified: true,
    });

    for (const id of [owner._id.toString(), new Types.ObjectId().toString()]) {
      await assert.rejects(
        service.unlock(id),
        new EntityNotFoundError('User not found'),
      );
    }
    assert.strictEqual(record.mock.callCount(), 0);
  });

  test('markVerified sets the flag and audits the action', async () => {
    const record = mock.fn(async () => {});
    const user = await createBlockedUser();
    const service = buildService(record);

    const verified = await service.markVerified(user._id.toString(), {
      actorId: DEFAULT_USER._id.toString(),
    });

    assert.strictEqual(verified.verified, true);
    assert.strictEqual(record.mock.callCount(), 1);
    const args = record.mock.calls[0]?.arguments[0] as
      | { event: AuditEvent }
      | undefined;
    assert.strictEqual(args?.event, AuditEvent.USER_VERIFIED);
  });

  test('markVerified answers 404 for the owner and for an unknown id', async () => {
    const record = mock.fn(async () => {});
    const service = buildService(record);
    const owner = await fixture.create<UserInterface>('User', {
      email: generateRandomEmail('owner+'),
      role: Roles.OWNER,
      password: 'hashedpassword123',
      verified: true,
    });

    for (const id of [owner._id.toString(), new Types.ObjectId().toString()]) {
      await assert.rejects(
        service.markVerified(id),
        new EntityNotFoundError('User not found'),
      );
    }
    assert.strictEqual(record.mock.callCount(), 0);
  });

  test('works without an audit port', async () => {
    const user = await createBlockedUser();
    const service = new UsersService(User, new CryptoService());

    const unlocked = await service.unlock(user._id.toString());
    const verified = await service.markVerified(user._id.toString());

    assert.strictEqual(unlocked.loginAttempts, 0);
    assert.strictEqual(verified.verified, true);
  });
});

describe('UsersService session listing', () => {
  const createUser = () =>
    fixture.create<UserInterface>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('sessions+'),
      password: 'hashedpassword123',
    });

  test('delegates with the target id once the user exists', async () => {
    const user = await createUser();
    const listSessions = mock.fn(async () => []);
    const service = new UsersService(User, new CryptoService());
    service.setSessionLister({
      listSessions,
      revokeSession: async () => true,
      revokeAllSessions: async () => [],
    });

    const sessions = await service.listSessions(user._id.toString());

    assert.deepStrictEqual(sessions, []);
    assert.deepStrictEqual(listSessions.mock.calls[0]?.arguments, [
      user._id.toString(),
    ]);
  });

  test('fails closed when no lister is wired', async () => {
    const user = await createUser();
    const service = new UsersService(User, new CryptoService());

    await assert.rejects(
      service.listSessions(user._id.toString()),
      new Error('Session manager is not configured'),
    );
  });

  test('answers 404 for the owner and for an unknown id', async () => {
    const listSessions = mock.fn(async () => []);
    const owner = await fixture.create<UserInterface>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('sessions-owner+'),
      role: Roles.OWNER,
      password: 'hashedpassword123',
      verified: true,
    });
    const service = new UsersService(User, new CryptoService());
    service.setSessionLister({
      listSessions,
      revokeSession: async () => true,
      revokeAllSessions: async () => [],
    });

    for (const id of [owner._id.toString(), new Types.ObjectId().toString()]) {
      await assert.rejects(
        service.listSessions(id),
        new EntityNotFoundError('User not found'),
      );
    }
    assert.strictEqual(listSessions.mock.callCount(), 0);
  });

  test('rejects a malformed id', async () => {
    const service = new UsersService(User, new CryptoService());

    await assert.rejects(
      service.listSessions('bad-id'),
      new InvalidArgumentError('Invalid ID format'),
    );
  });
});

describe('UsersService session revocation', () => {
  const createUser = () =>
    fixture.create<UserInterface>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('revoke-session+'),
      password: 'hashedpassword123',
    });

  const buildService = (overrides: {
    listSessions?: (userId: string) => Promise<never[]>;
    revokeSession?: (userId: string, sessionId: string) => Promise<boolean>;
    revokeAllSessions?: (userId: string) => Promise<string[]>;
    record?: ReturnType<typeof mock.fn>;
  }) => {
    const record = overrides.record ?? mock.fn(async () => {});
    const service = new UsersService(
      User,
      new CryptoService(),
      5,
      900000,
      undefined,
      { record } as never,
    );
    service.setSessionLister({
      listSessions: overrides.listSessions ?? (async () => []),
      revokeSession: overrides.revokeSession ?? (async () => true),
      revokeAllSessions: overrides.revokeAllSessions ?? (async () => []),
    });

    return { service, record };
  };

  test('revokes one session and audits the session id', async () => {
    const user = await createUser();
    const sessionId = '550e8400-e29b-41d4-a716-446655440099';
    const revokeSession = mock.fn(async () => true);
    const { service, record } = buildService({ revokeSession });

    await service.revokeSession(user._id.toString(), sessionId, {
      actorId: DEFAULT_USER._id.toString(),
    });

    assert.deepStrictEqual(revokeSession.mock.calls[0]?.arguments, [
      user._id.toString(),
      sessionId,
    ]);
    assert.strictEqual(record.mock.callCount(), 1);
    const event = record.mock.calls[0]?.arguments[0] as Record<string, unknown>;
    assert.strictEqual(event.event, AuditEvent.SESSION_REVOKED_BY_ADMIN);
    assert.strictEqual(event.sessionId, sessionId);
    assert.strictEqual(event.targetUserId, user._id.toString());
  });

  test('does not audit a repeated (already revoked) session', async () => {
    const user = await createUser();
    const revokeSession = mock.fn(async () => false);
    const { service, record } = buildService({ revokeSession });

    await service.revokeSession(user._id.toString(), 'session-a');

    assert.strictEqual(revokeSession.mock.callCount(), 1);
    assert.strictEqual(record.mock.callCount(), 0);
  });

  test('revokes every session and audits each one', async () => {
    const user = await createUser();
    const revokeAllSessions = mock.fn(async () => ['session-a', 'session-b']);
    const { service, record } = buildService({ revokeAllSessions });

    await service.revokeAllSessions(user._id.toString());

    assert.strictEqual(revokeAllSessions.mock.callCount(), 1);
    assert.strictEqual(record.mock.callCount(), 2);
    const calls = record.mock.calls as Array<{
      arguments: [{ sessionId: string }];
    }>;
    const ids = calls.map((call) => call.arguments[0].sessionId);
    assert.deepStrictEqual(ids.sort(), ['session-a', 'session-b']);
  });

  test('does not revoke or audit the owner, an unknown id or a malformed id', async () => {
    const owner = await fixture.create<UserInterface>('User', {
      _id: new Types.ObjectId(),
      email: generateRandomEmail('revoke-owner+'),
      role: Roles.OWNER,
      password: 'hashedpassword123',
      verified: true,
    });
    const revokeSession = mock.fn(async () => true);
    const { service, record } = buildService({ revokeSession });

    for (const id of [owner._id.toString(), new Types.ObjectId().toString()]) {
      await assert.rejects(
        service.revokeSession(id, 'any-session'),
        new EntityNotFoundError('User not found'),
      );
    }
    await assert.rejects(
      service.revokeSession('bad-id', 'any-session'),
      new InvalidArgumentError('Invalid ID format'),
    );

    assert.strictEqual(revokeSession.mock.callCount(), 0);
    assert.strictEqual(record.mock.callCount(), 0);
  });
});

describe('UsersService.recordLogin', () => {
  let service: UsersService;

  before(() => {
    service = new UsersService(User, new CryptoService());
  });

  test('updates lastLoginAt without touching credentials or flags', async () => {
    const user = await service.create({
      email: generateRandomEmail('lastlogin+'),
      password: 'hashedpassword123',
      verified: true,
    });
    const before = await service.findById(user._id.toString());

    await service.recordLogin(user._id.toString());

    const after = await service.findById(user._id.toString());
    assert.ok(after?.lastLoginAt instanceof Date);
    assert.strictEqual(after?.password, before?.password);
    assert.strictEqual(after?.role, before?.role);
    assert.strictEqual(after?.verified, before?.verified);
    assert.strictEqual(after?.mfaEnabled, before?.mfaEnabled);
  });

  test('rejects a malformed id', async () => {
    await assert.rejects(
      service.recordLogin('bad-id'),
      new InvalidArgumentError('Invalid ID format'),
    );
  });
});
