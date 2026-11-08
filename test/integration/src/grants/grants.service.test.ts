import { Model, Types } from 'mongoose';

import { Application as ApplicationInterface } from '../../../../src/applications/applications.interface';
import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../src/applications/applications.service';
import { AuditEvent } from '../../../../src/audit';
import { Roles } from '../../../../src/common/enums/roles.enum';
import { ForbiddenError } from '../../../../src/common/exceptions/auth.exceptions';
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
import { HolderFactory } from '../../../helpers/factories/holder.factory';
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

describe('GrantsService.grantMemberByEmail', () => {
  let applicationsService: ApplicationsService;
  let usersService: UsersService;

  before(() => {
    applicationsService = new ApplicationsService(ApplicationModel);
    usersService = new UsersService(User, new CryptoService());
  });

  const createService = (record?: ReturnType<typeof mock.fn>) => {
    const service = new GrantsService(
      GrantModel,
      applicationsService,
      usersService,
      record === undefined ? undefined : ({ record } as never),
    );

    return service;
  };

  const createApplication = async () => {
    const application = ApplicationFactory.generate();

    return applicationsService.create({
      name: application.name,
      slug: application.slug,
      audience: application.audience,
    });
  };

  const createAccount = async () => {
    const email = MotherFactory.email();
    const user = await fixture.create<UserInterface>(
      'User',
      UserFactory.generate({ email, verified: true }),
    );

    return { id: user._id.toString(), email };
  };

  test('AC-1: an existing account gets the grant and one member.granted event', async () => {
    const record = mock.fn(async () => {});
    const service = createService(record);
    const application = await createApplication();
    const account = await createAccount();

    const result = await service.grantMemberByEmail({
      email: account.email.toUpperCase(),
      applicationId: application._id.toString(),
      role: GrantRoles.EDITOR,
      actorRole: Roles.ADMIN,
      actorId: new Types.ObjectId().toString(),
    });

    assert.deepStrictEqual(result, {
      email: account.email,
      role: GrantRoles.EDITOR,
    });

    const grants = await fixture.find<Grant>(GrantModel.modelName, {
      userId: new Types.ObjectId(account.id),
      applicationId: application._id,
    });
    assert.strictEqual(grants.length, 1);

    const calls = record.mock.calls as Array<{
      arguments: [{ event: AuditEvent }];
    }>;
    const events = calls
      .map((call) => call.arguments[0])
      .filter((event) => event.event === AuditEvent.MEMBER_GRANTED);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(
      calls.some(
        (call) => call.arguments[0].event === AuditEvent.GRANT_ASSIGNED,
      ),
      false,
    );
  });

  test('AC-2: an email without an account receives an invitation', async () => {
    const inviteMember = mock.fn(async () => {});
    const service = createService();
    service.setInvitationsPort({ inviteMember });
    const application = await createApplication();
    const email = `unknown-${Date.now()}@example.com`;

    const result = await service.grantMemberByEmail({
      email,
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
      actorRole: Roles.ADMIN,
    });

    assert.deepStrictEqual(result, { email, role: GrantRoles.VIEWER });
    assert.strictEqual(inviteMember.mock.callCount(), 1);

    const grants = await fixture.find<Grant>(GrantModel.modelName, {
      applicationId: application._id,
    });
    assert.strictEqual(grants.length, 0);
  });

  test('AC-2: a pre-verification holder receives an invitation', async () => {
    const inviteMember = mock.fn(async () => {});
    const service = createService();
    service.setInvitationsPort({ inviteMember });
    const application = await createApplication();
    const holder = await fixture.create(
      'Holder',
      HolderFactory.generate({ email: MotherFactory.email() }),
    );

    const result = await service.grantMemberByEmail({
      email: holder.email,
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
      actorRole: Roles.ADMIN,
    });

    assert.deepStrictEqual(result, {
      email: holder.email,
      role: GrantRoles.VIEWER,
    });
    assert.strictEqual(inviteMember.mock.callCount(), 1);

    const grants = await fixture.find<Grant>(GrantModel.modelName, {
      applicationId: application._id,
    });
    assert.strictEqual(grants.length, 0);
  });

  test('AC-3: an app admin cannot grant admin or touch an admin member', async () => {
    const service = createService();
    const application = await createApplication();
    const account = await createAccount();
    const adminAccount = await createAccount();

    await assert.rejects(
      service.grantMemberByEmail({
        email: account.email,
        applicationId: application._id.toString(),
        role: GrantRoles.ADMIN,
        actorRole: Roles.ADMIN,
      }),
      ForbiddenError,
    );

    await fixture.create<Grant>(GrantModel.modelName, {
      userId: new Types.ObjectId(adminAccount.id),
      applicationId: application._id,
      role: GrantRoles.ADMIN,
    });

    await assert.rejects(
      service.grantMemberByEmail({
        email: adminAccount.email,
        applicationId: application._id.toString(),
        role: GrantRoles.VIEWER,
        actorRole: Roles.ADMIN,
      }),
      ForbiddenError,
    );

    // The owner can manage an existing admin member.
    const result = await service.grantMemberByEmail({
      email: adminAccount.email,
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
      actorRole: Roles.OWNER,
    });
    assert.deepStrictEqual(result, {
      email: adminAccount.email,
      role: GrantRoles.VIEWER,
    });
  });

  test('retries the grant path when a signup lands during the invitation', async () => {
    const application = await createApplication();
    const email = MotherFactory.email();
    const user = await fixture.create<UserInterface>(
      'User',
      UserFactory.generate({ email, verified: true }),
    );
    let lookups = 0;
    const record = mock.fn(async () => {});
    const service = new GrantsService(
      GrantModel,
      applicationsService,
      {
        findByEmail: async () => {
          lookups += 1;
          return lookups === 1 ? null : user;
        },
      } as never,
      { record } as never,
    );
    service.setInvitationsPort({
      inviteMember: async () => {
        throw new InvalidArgumentError('Invitation could not be created');
      },
    });

    const result = await service.grantMemberByEmail({
      email,
      applicationId: application._id.toString(),
      role: GrantRoles.EDITOR,
      actorRole: Roles.OWNER,
    });

    assert.deepStrictEqual(result, { email, role: GrantRoles.EDITOR });
    const grants = await fixture.find<Grant>(GrantModel.modelName, {
      userId: user._id,
      applicationId: application._id,
    });
    assert.strictEqual(grants.length, 1);
    const calls = record.mock.calls as Array<{
      arguments: [{ event: AuditEvent }];
    }>;
    assert.strictEqual(
      calls.filter(
        (call) => call.arguments[0].event === AuditEvent.MEMBER_GRANTED,
      ).length,
      1,
    );
  });

  test('AC-4: repeating the grant converges the role without duplicates', async () => {
    const service = createService();
    const application = await createApplication();
    const account = await createAccount();

    const input = {
      email: account.email,
      applicationId: application._id.toString(),
      actorRole: Roles.OWNER,
    } as const;

    await service.grantMemberByEmail({ ...input, role: GrantRoles.EDITOR });
    const result = await service.grantMemberByEmail({
      ...input,
      role: GrantRoles.VIEWER,
    });

    assert.deepStrictEqual(result, {
      email: account.email,
      role: GrantRoles.VIEWER,
    });

    const grants = await fixture.find<Grant>(GrantModel.modelName, {
      userId: new Types.ObjectId(account.id),
      applicationId: application._id,
    });
    assert.strictEqual(grants.length, 1);
    assert.strictEqual(grants[0]?.role, GrantRoles.VIEWER);
  });

  test('AC-5: rejects an invalid email and a missing or inactive application', async () => {
    const service = createService();
    const inviteMember = mock.fn(async () => {});
    service.setInvitationsPort({ inviteMember });

    await assert.rejects(
      service.grantMemberByEmail({
        email: 'not-an-email',
        applicationId: new Types.ObjectId().toString(),
        role: GrantRoles.VIEWER,
        actorRole: Roles.OWNER,
      }),
      InvalidArgumentError,
    );

    await assert.rejects(
      service.grantMemberByEmail({
        email: MotherFactory.email(),
        applicationId: new Types.ObjectId().toString(),
        role: GrantRoles.VIEWER,
        actorRole: Roles.OWNER,
      }),
      EntityNotFoundError,
    );

    const application = await createApplication();
    await ApplicationModel.updateOne(
      { _id: application._id },
      { active: false },
    );

    await assert.rejects(
      service.grantMemberByEmail({
        email: MotherFactory.email(),
        applicationId: application._id.toString(),
        role: GrantRoles.VIEWER,
        actorRole: Roles.OWNER,
      }),
      EntityNotFoundError,
    );
    assert.strictEqual(inviteMember.mock.callCount(), 0);
  });
});
