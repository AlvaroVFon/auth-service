import { Types } from 'mongoose';

import { Roles } from '../../../../src/common/enums/roles.enum';
import { ForbiddenError } from '../../../../src/common/exceptions/auth.exceptions';
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../../../src/common/exceptions/base.exception';
import { CryptoService } from '../../../../src/libs/crypto/crypto.service';
import { User as UserInterface } from '../../../../src/users/users.interface';
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
      test('should return an empty array if no users exist', async () => {
        const users = await usersService.findAll();
        assert.ok(Array.isArray(users));
        assert.strictEqual(users.length, 0);
      });

      test('should return all users', async () => {
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
        ]);

        const foundUsers = await usersService.findAll();
        assert.ok(Array.isArray(foundUsers));
        assert.strictEqual(foundUsers.length, users.length);
        assert.strictEqual(foundUsers[0]!.email, users[0]!.email);
        assert.strictEqual(foundUsers[1]!.email, users[1]!.email);
        assert.ok(foundUsers[0]!._id);
        assert.ok(foundUsers[1]!._id);
        assert.ok(foundUsers[0]!.password);
        assert.ok(foundUsers[1]!.password);
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
