import { UsersService } from '../../../../src/users/users.service';
import { User } from '../../../../src/users/users.schema';
import { User as UserInterface } from '../../../../src/users/users.interface';
import { generateRandomEmail } from '../../../fixtures/defaults/users.default';
import fixture from '../../../fixtures/fixture';
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../../../src/common/exceptions/base.exception';
import { DEFAULT_USER } from '../../../fixtures/defaults/index';
import { CryptoService } from '../../../../src/libs/crypto/crypto.service';

describe('UsersService', () => {
  let usersService: UsersService;

  before(() => {
    usersService = new UsersService(User, new CryptoService());
  });

  describe('UsersService Initialization', () => {
    test('should initialize UsersService with usersModel', () => {
      assert.ok(usersService);
      assert.strictEqual((usersService as any).usersModel, User);
    });
  });

  describe('UsersService Methods', () => {
    describe('Create()', () => {
      test('should create a new user', async () => {
        const plainPassword = 'securepassword123';

        const userData: Partial<UserInterface> = {
          email: generateRandomEmail('testuser+'),
          username: 'testuser',
          password: plainPassword,
        };

        const newUser = await usersService.create(userData);
        assert.ok(newUser);
        assert.strictEqual(newUser.email, userData.email);
        assert.strictEqual(newUser.username, userData.username);

        const foundUser = await fixture.findById<UserInterface>(
          'User',
          // @ts-expect-error newUser._id exists
          newUser._id,
        );
        assert.ok(foundUser);
        assert.strictEqual(foundUser!.email, userData.email);
        assert.strictEqual(foundUser!.username, userData.username);
        assert.notStrictEqual(foundUser!.password, plainPassword);
        assert.strictEqual(foundUser?.password, newUser.password);
      });

      test('should throw an error when creating a user with missing required fields', async () => {
        const userData: Partial<UserInterface> = {
          username: 'incompleteuser',
          password: 'hashedpassword123',
        };

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
        const userData: Partial<UserInterface> = {
          email: 'invalid-email-format',
          username: 'invalidemailuser',
          password: plainPassword,
        };

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

        const userData1: Partial<UserInterface> = {
          email: email,
          username: 'firstuser',
          password: 'hashedpassword123',
        };
        const userData2: Partial<UserInterface> = {
          email: email,
          username: 'seconduser',
          password: 'hashedpassword123',
        };

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
        const userData: Partial<UserInterface> = {
          email: generateRandomEmail('requiredonly+'),
          password: 'hashedpassword123',
        };

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
        const userData: Partial<UserInterface> = {
          email: generateRandomEmail('allfields+'),
          username: 'allfieldsuser',
          password: 'hashedpassword123',
        };

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
        const newUser = await usersService.create({
          email: generateRandomEmail('findbyid+'),
          username: 'findbyiduser',
          password: 'hashedpassword123',
        });

        const foundUser = await usersService.findById(newUser._id.toString());
        assert.ok(foundUser);
        assert.strictEqual(foundUser!._id.toString(), newUser._id.toString());
        assert.strictEqual(foundUser!.email, newUser.email);
        assert.strictEqual(foundUser!.username, newUser.username);
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
        const newUser = await usersService.create({
          email: generateRandomEmail('updateone+'),
          username: 'updateoneuser',
          password: 'hashedpassword123',
        });

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
        const newUser = await usersService.create({
          email: generateRandomEmail('partialupdate+'),
          username: 'partialupdateuser',
          password: 'hashedpassword123',
        });
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
        const newUser = await usersService.create({
          email: generateRandomEmail('updatepassword+'),
          username: 'updatepassworduser',
          password: plainPassword,
        });

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

      test('should delete a user by id', async () => {
        const newUser = await fixture.create<UserInterface>('User', {
          email: generateRandomEmail('deleteone+'),
          password: 'hashedpassword123',
        });

        const deletedUser = await usersService.deleteOneById(
          newUser._id.toString(),
        );
        assert.ok(deletedUser);
        assert.strictEqual(deletedUser!._id.toString(), newUser._id.toString());
      });
    });
  });
});
