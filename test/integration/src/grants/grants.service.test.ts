import { Model, Types } from 'mongoose';

import { Application as ApplicationInterface } from '../../../../src/applications/applications.interface';
import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../src/applications/applications.service';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../../../src/common/exceptions/base.exception';
import type { ListQuery } from '../../../../src/common/pagination';
import { Grant, GrantRoles } from '../../../../src/grants/grants.interface';
import type { GrantMemberSortField } from '../../../../src/grants/grants.port';
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

    test('should keep an archived application assignable for the owner', async () => {
      const application = await createApplication();
      const userId = await createUser();
      const applicationId = application._id.toString();
      await applicationsService.archive(applicationId);

      const grant = await grantsService.assignRole(
        { userId, applicationId, role: GrantRoles.VIEWER },
        { includeArchived: true },
      );

      assert.strictEqual(grant.role, GrantRoles.VIEWER);
      assert.strictEqual(grant.applicationId.toString(), applicationId);
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
  describe('listActiveByUser', () => {
    test('should list the active applications granted to the user with its role', async () => {
      const applicationA = await createApplication();
      const applicationB = await createApplication();
      const unrelatedApplication = await createApplication();
      const userId = await createUser();
      const otherUserId = await createUser();

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
      await grantsService.assignRole({
        userId: otherUserId,
        applicationId: unrelatedApplication._id.toString(),
        role: GrantRoles.EDITOR,
      });

      const entries = await grantsService.listActiveByUser(userId);
      const byApplicationId = new Map(
        entries.map((entry) => [entry.application._id.toString(), entry.role]),
      );

      assert.strictEqual(entries.length, 2);
      assert.strictEqual(
        byApplicationId.get(applicationA._id.toString()),
        GrantRoles.ADMIN,
      );
      assert.strictEqual(
        byApplicationId.get(applicationB._id.toString()),
        GrantRoles.VIEWER,
      );
      assert.ok(
        !byApplicationId.has(unrelatedApplication._id.toString()),
        'grants from another user must not leak',
      );
    });

    test('should expose the same active grants through both projections', async () => {
      const userId = await createUser();
      const zebraTemplate = ApplicationFactory.generate({ name: 'Zebra' });
      const alphaTemplate = ApplicationFactory.generate({ name: 'Alpha' });
      const zebra = await applicationsService.create({
        name: zebraTemplate.name,
        slug: zebraTemplate.slug,
        audience: zebraTemplate.audience,
      });
      const alpha = await applicationsService.create({
        name: alphaTemplate.name,
        slug: alphaTemplate.slug,
        audience: alphaTemplate.audience,
      });

      await grantsService.assignRole({
        userId,
        applicationId: zebra._id.toString(),
        role: GrantRoles.VIEWER,
      });
      await grantsService.assignRole({
        userId,
        applicationId: alpha._id.toString(),
        role: GrantRoles.VIEWER,
      });

      const entries = await grantsService.listActiveByUser(userId);
      assert.deepStrictEqual(
        entries.map(({ application }) => application._id.toString()).sort(),
        [alpha._id.toString(), zebra._id.toString()].sort(),
      );

      const grants = await grantsService.listByUser(userId);
      assert.deepStrictEqual(
        grants.map(({ applicationId }) => applicationId.toString()).sort(),
        entries.map(({ application }) => application._id.toString()).sort(),
      );
    });

    test('should return an empty list when the user has no grants', async () => {
      const userId = await createUser();

      assert.deepStrictEqual(await grantsService.listActiveByUser(userId), []);
    });

    test('should discard grants of inactive applications', async () => {
      const application = await createApplication();
      const userId = await createUser();

      await grantsService.assignRole({
        userId,
        applicationId: application._id.toString(),
        role: GrantRoles.ADMIN,
      });
      await ApplicationModel.updateOne(
        { _id: application._id },
        { active: false },
      );

      assert.deepStrictEqual(await grantsService.listActiveByUser(userId), []);
    });

    test('should reject an invalid user id', async () => {
      await assert.rejects(
        grantsService.listActiveByUser('bad-id'),
        new InvalidArgumentError('userId format is invalid'),
      );
    });
  });

  describe('inactive applications', () => {
    test('should hide grants of inactive applications', async () => {
      const application = await createApplication();
      const userId = await createUser();

      await grantsService.assignRole({
        userId,
        applicationId: application._id.toString(),
        role: GrantRoles.ADMIN,
      });
      await ApplicationModel.updateOne(
        { _id: application._id },
        { active: false },
      );

      assert.strictEqual(
        await grantsService.findByUserAndApplication(
          userId,
          application._id.toString(),
        ),
        null,
      );
      assert.deepStrictEqual(await grantsService.listByUser(userId), []);
    });

    test('should expose the grants of an archived application to the owner', async () => {
      const application = await createApplication();
      const userId = await createUser();
      const applicationId = application._id.toString();

      await grantsService.assignRole({
        userId,
        applicationId,
        role: GrantRoles.EDITOR,
      });
      await applicationsService.archive(applicationId);

      const grant = await grantsService.findByUserAndApplication(
        userId,
        applicationId,
        { includeArchived: true },
      );
      assert.strictEqual(grant?.role, GrantRoles.EDITOR);

      assert.deepStrictEqual(await grantsService.listByUser(userId), []);
    });

    test('should reject an archived application without the owner scope', async () => {
      const application = await createApplication();
      await applicationsService.archive(application._id.toString());

      await assert.rejects(
        grantsService.listByApplication(application._id.toString()),
        new EntityNotFoundError('Application not found'),
      );
    });
  });

  describe('listByApplication', () => {
    test('should list every grant of one application', async () => {
      const applicationA = await createApplication();
      const applicationB = await createApplication();
      const userA = await createUser();
      const userB = await createUser();

      await grantsService.assignRole({
        userId: userA,
        applicationId: applicationA._id.toString(),
        role: GrantRoles.ADMIN,
      });
      await grantsService.assignRole({
        userId: userB,
        applicationId: applicationA._id.toString(),
        role: GrantRoles.VIEWER,
      });
      await grantsService.assignRole({
        userId: userA,
        applicationId: applicationB._id.toString(),
        role: GrantRoles.EDITOR,
      });

      const grants = await grantsService.listByApplication(
        applicationA._id.toString(),
      );

      assert.strictEqual(grants.length, 2);
    });

    test('should reject an unknown or inactive application', async () => {
      const application = await createApplication();
      await ApplicationModel.updateOne(
        { _id: application._id },
        { active: false },
      );

      await assert.rejects(
        grantsService.listByApplication(application._id.toString()),
        EntityNotFoundError,
      );
      await assert.rejects(
        grantsService.listByApplication('64b64c4f4f4f4f4f4f4f4f4f'),
        EntityNotFoundError,
      );
    });
  });

  describe('revokeRole', () => {
    test('should delete the grant of the pair', async () => {
      const application = await createApplication();
      const userId = await createUser();

      await grantsService.assignRole({
        userId,
        applicationId: application._id.toString(),
        role: GrantRoles.VIEWER,
      });

      await grantsService.revokeRole(userId, application._id.toString());

      assert.strictEqual(
        await grantsService.findByUserAndApplication(
          userId,
          application._id.toString(),
        ),
        null,
      );

      await assert.rejects(
        grantsService.revokeRole(userId, application._id.toString()),
        new EntityNotFoundError('Grant not found'),
      );
    });
  });

  describe('deleteByUser', () => {
    test('should delete every grant of the user only', async () => {
      const applicationA = await createApplication();
      const applicationB = await createApplication();
      const userId = await createUser();
      const otherUserId = await createUser();

      await grantsService.assignRole({
        userId,
        applicationId: applicationA._id.toString(),
        role: GrantRoles.VIEWER,
      });
      await grantsService.assignRole({
        userId,
        applicationId: applicationB._id.toString(),
        role: GrantRoles.EDITOR,
      });
      await grantsService.assignRole({
        userId: otherUserId,
        applicationId: applicationA._id.toString(),
        role: GrantRoles.ADMIN,
      });

      await grantsService.deleteByUser(userId);

      assert.deepStrictEqual(await grantsService.listByUser(userId), []);
      assert.strictEqual(
        (await grantsService.listByUser(otherUserId)).length,
        1,
      );
    });
  });
});

describe('GrantsService.listMembers', () => {
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

  const createMember = async (
    applicationId: Types.ObjectId,
    role: GrantRoles,
    overrides: Partial<UserInterface> = {},
  ) => {
    const user = await fixture.create<UserInterface>(
      'User',
      UserFactory.generate({ ...overrides }),
    );
    await fixture.create<Grant>(GrantModel.modelName, {
      _id: new Types.ObjectId(),
      userId: user._id,
      applicationId,
      role,
    });

    return user;
  };

  const query = (
    overrides: Partial<ListQuery<GrantMemberSortField>> = {},
  ): ListQuery<GrantMemberSortField> => ({
    page: 1,
    limit: 20,
    sort: { field: 'createdAt', direction: -1 },
    ...overrides,
  });

  test('paginates stably and hydrates the readable member fields', async () => {
    const application = await createApplication();
    const first = await createMember(application._id, GrantRoles.ADMIN, {
      username: 'first-member',
      verified: true,
      mfaEnabled: true,
      lastLoginAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const second = await createMember(application._id, GrantRoles.VIEWER, {
      username: 'second-member',
    });

    const pageOne = await grantsService.listMembers(
      application._id.toString(),
      query({ limit: 1 }),
    );
    const pageTwo = await grantsService.listMembers(
      application._id.toString(),
      query({ page: 2, limit: 1 }),
    );

    assert.strictEqual(pageOne.total, 2);
    assert.strictEqual(pageTwo.total, 2);
    const ids = [pageOne.items[0]!.userId, pageTwo.items[0]!.userId];
    assert.deepStrictEqual(
      ids.sort(),
      [first._id.toString(), second._id.toString()].sort(),
    );
    assert.strictEqual(new Set(ids).size, 2);

    const admin = [pageOne, pageTwo]
      .flatMap((page) => page.items)
      .find((member) => member.userId === first._id.toString());
    assert.ok(admin);
    assert.strictEqual(admin?.email, first.email);
    assert.strictEqual(admin?.username, 'first-member');
    assert.strictEqual(admin?.verified, true);
    assert.strictEqual(admin?.mfaEnabled, true);
    assert.strictEqual(admin?.role, GrantRoles.ADMIN);
    assert.ok(admin?.createdAt instanceof Date);
    assert.strictEqual(
      admin?.lastLoginAt?.toISOString(),
      '2026-01-01T00:00:00.000Z',
    );
    assert.strictEqual('password' in admin!, false);
    assert.strictEqual('mfaSecret' in admin!, false);
  });

  test('drops orphan grants whose user no longer exists', async () => {
    const application = await createApplication();
    await createMember(application._id, GrantRoles.VIEWER);
    await fixture.create<Grant>(GrantModel.modelName, {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      applicationId: application._id,
      role: GrantRoles.EDITOR,
    });

    const result = await grantsService.listMembers(
      application._id.toString(),
      query(),
    );

    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.items.length, 1);
  });
});
