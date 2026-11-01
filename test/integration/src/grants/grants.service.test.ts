import { Model, Types } from 'mongoose';

import { Application as ApplicationInterface } from '../../../../src/applications/applications.interface';
import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../src/applications/applications.service';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../../../src/common/exceptions/base.exception';
import { Grant, GrantRoles } from '../../../../src/grants/grants.interface';
import { GrantModel } from '../../../../src/grants/grants.schema';
import { GrantsService } from '../../../../src/grants/grants.service';
import { CryptoService } from '../../../../src/libs/crypto/crypto.service';
import { User as UserInterface } from '../../../../src/users/users.interface';
import { User } from '../../../../src/users/users.schema';
import { UsersService } from '../../../../src/users/users.service';
import fixture from '../../../fixtures';
import { ApplicationFactory } from '../../../helpers/factories/application.factory';
import { MotherFactory } from '../../../helpers/factories/mother.factory';
import { UserFactory } from '../../../helpers/factories/user.factory';

describe('GrantsService', () => {
  let applicationsService: ApplicationsService;
  let usersService: UsersService;
  let grantsService: GrantsService;

  before(() => {
    applicationsService = new ApplicationsService(ApplicationModel);
    usersService = new UsersService(User, new CryptoService());
    grantsService = new GrantsService(
      GrantModel,
      applicationsService,
      usersService,
    );
  });

  const createApplication = async () => {
    const application = ApplicationFactory.generate();

    return applicationsService.create({
      name: application.name,
      slug: application.slug,
      audience: application.audience,
    });
  };

  const createUser = async () => {
    const user = await fixture.create<UserInterface>(
      'User',
      UserFactory.generate(),
    );

    return String(user._id);
  };

  describe('assignRole', () => {
    test('should create a grant for a user and application', async () => {
      const application = await createApplication();
      const userId = await createUser();

      const grant = await grantsService.assignRole({
        userId,
        applicationId: application._id.toString(),
        role: GrantRoles.ADMIN,
      });

      assert.strictEqual(grant.role, GrantRoles.ADMIN);
      assert.strictEqual(grant.userId.toString(), userId);
      assert.strictEqual(
        grant.applicationId.toString(),
        application._id.toString(),
      );
    });

    test('should update the existing grant for the same pair', async () => {
      const application = await createApplication();
      const userId = await createUser();
      const applicationId = application._id.toString();

      const first = await grantsService.assignRole({
        userId,
        applicationId,
        role: GrantRoles.VIEWER,
      });
      const second = await grantsService.assignRole({
        userId,
        applicationId,
        role: GrantRoles.EDITOR,
      });

      assert.strictEqual(second._id.toString(), first._id.toString());

      const grants = await fixture.find<Grant>('Grant', {
        userId: new Types.ObjectId(userId),
        applicationId: application._id,
      });

      assert.strictEqual(grants.length, 1);
      assert.strictEqual(grants[0]?.role, GrantRoles.EDITOR);
    });

    test('should retry the upsert when a concurrent writer wins the index', async () => {
      const application = await createApplication();
      const userId = await createUser();
      const expected = {
        userId: new Types.ObjectId(userId),
        applicationId: application._id,
        role: GrantRoles.ADMIN,
      } as Grant;
      let calls = 0;
      const findOneAndUpdate = mock.fn(async () => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error('E11000 duplicate key error'), {
            code: 11000,
          });
        }

        return expected;
      });
      const service = new GrantsService(
        { findOneAndUpdate } as unknown as Model<Grant>,
        applicationsService,
        usersService,
      );

      const grant = await service.assignRole({
        userId,
        applicationId: application._id.toString(),
        role: GrantRoles.ADMIN,
      });

      assert.strictEqual(grant, expected);
      assert.strictEqual(findOneAndUpdate.mock.callCount(), 2);
    });

    test('should not swallow other database errors', async () => {
      const application = await createApplication();
      const userId = await createUser();
      const failure = new Error('connection lost');
      const findOneAndUpdate = mock.fn(async () => {
        throw failure;
      });
      const service = new GrantsService(
        { findOneAndUpdate } as unknown as Model<Grant>,
        applicationsService,
        usersService,
      );

      await assert.rejects(
        service.assignRole({
          userId,
          applicationId: application._id.toString(),
          role: GrantRoles.ADMIN,
        }),
        failure,
      );
      assert.strictEqual(findOneAndUpdate.mock.callCount(), 1);
    });

    test('should require a user id', async () => {
      const application = await createApplication();

      await assert.rejects(
        grantsService.assignRole({
          userId: '',
          applicationId: application._id.toString(),
          role: GrantRoles.VIEWER,
        }),
        new InvalidArgumentError('userId is required'),
      );
    });

    test('should reject an invalid user id', async () => {
      const application = await createApplication();

      await assert.rejects(
        grantsService.assignRole({
          userId: 'bad-id',
          applicationId: application._id.toString(),
          role: GrantRoles.VIEWER,
        }),
        new InvalidArgumentError('userId format is invalid'),
      );
    });

    test('should require an application id', async () => {
      const userId = await createUser();

      await assert.rejects(
        grantsService.assignRole({
          userId,
          applicationId: '',
          role: GrantRoles.VIEWER,
        }),
        new InvalidArgumentError('applicationId is required'),
      );
    });

    test('should reject an invalid application id', async () => {
      const userId = await createUser();

      await assert.rejects(
        grantsService.assignRole({
          userId,
          applicationId: 'bad-id',
          role: GrantRoles.VIEWER,
        }),
        new InvalidArgumentError('applicationId format is invalid'),
      );
    });

    test('should reject an unknown role', async () => {
      const application = await createApplication();
      const userId = await createUser();

      await assert.rejects(
        grantsService.assignRole({
          userId,
          applicationId: application._id.toString(),
          role: 'owner' as GrantRoles,
        }),
        new InvalidArgumentError('Invalid role'),
      );
    });

    test('should reject an unknown application', async () => {
      const userId = await createUser();

      await assert.rejects(
        grantsService.assignRole({
          userId,
          applicationId: String(MotherFactory.objectId()),
          role: GrantRoles.VIEWER,
        }),
        new EntityNotFoundError('Application not found'),
      );
    });

    test('should reject an inactive application', async () => {
      const application = ApplicationFactory.generate();
      const inactive = await fixture.create<ApplicationInterface>(
        'Application',
        { ...application, active: false },
      );
      const userId = await createUser();

      await assert.rejects(
        grantsService.assignRole({
          userId,
          applicationId: inactive._id.toString(),
          role: GrantRoles.VIEWER,
        }),
        new EntityNotFoundError('Application not found'),
      );
      assert.strictEqual((await fixture.find<Grant>('Grant', {})).length, 0);
    });

    test('should reject an unknown user', async () => {
      const application = await createApplication();

      await assert.rejects(
        grantsService.assignRole({
          userId: String(MotherFactory.objectId()),
          applicationId: application._id.toString(),
          role: GrantRoles.VIEWER,
        }),
        new EntityNotFoundError('User not found'),
      );
      assert.strictEqual((await fixture.find<Grant>('Grant', {})).length, 0);
    });
  });

  describe('findByUserAndApplication', () => {
    test('should return the role of the user in each application', async () => {
      const applicationA = await createApplication();
      const applicationB = await createApplication();
      const applicationC = await createApplication();
      const userId = await createUser();

      await grantsService.assignRole({
        userId,
        applicationId: applicationA._id.toString(),
        role: GrantRoles.ADMIN,
      });
      await grantsService.assignRole({
        userId,
        applicationId: applicationB._id.toString(),
        role: GrantRoles.VIEWER,
      });

      const roleA = await grantsService.findByUserAndApplication(
        userId,
        applicationA._id.toString(),
      );
      const roleB = await grantsService.findByUserAndApplication(
        userId,
        applicationB._id.toString(),
      );
      const roleC = await grantsService.findByUserAndApplication(
        userId,
        applicationC._id.toString(),
      );

      assert.strictEqual(roleA?.role, GrantRoles.ADMIN);
      assert.strictEqual(roleB?.role, GrantRoles.VIEWER);
      assert.strictEqual(roleC, null);
    });

    test('should not return grants from another user', async () => {
      const application = await createApplication();
      const userId = await createUser();
      const otherUserId = await createUser();

      await grantsService.assignRole({
        userId,
        applicationId: application._id.toString(),
        role: GrantRoles.ADMIN,
      });

      const grant = await grantsService.findByUserAndApplication(
        otherUserId,
        application._id.toString(),
      );

      assert.strictEqual(grant, null);
    });

    test('should reject invalid ids', async () => {
      await assert.rejects(
        grantsService.findByUserAndApplication('bad-id', 'bad-id'),
        new InvalidArgumentError('userId format is invalid'),
      );
    });
  });

  describe('listByUser', () => {
    test('should list every grant of a user', async () => {
      const applicationA = await createApplication();
      const applicationB = await createApplication();
      const userId = await createUser();

      await grantsService.assignRole({
        userId,
        applicationId: applicationA._id.toString(),
        role: GrantRoles.ADMIN,
      });
      await grantsService.assignRole({
        userId,
        applicationId: applicationB._id.toString(),
        role: GrantRoles.EDITOR,
      });

      const grants = await grantsService.listByUser(userId);

      assert.strictEqual(grants.length, 2);
    });

    test('should reject an invalid user id', async () => {
      await assert.rejects(
        grantsService.listByUser('bad-id'),
        new InvalidArgumentError('userId format is invalid'),
      );
    });
  });
});
