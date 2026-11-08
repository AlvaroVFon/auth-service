import { Types } from 'mongoose';

import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../src/applications/applications.service';
import { Roles } from '../../../../src/common/enums/roles.enum';
import { ForbiddenError } from '../../../../src/common/exceptions/auth.exceptions';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../../../src/common/exceptions/base.exception';
import { InvalidLinkError } from '../../../../src/common/exceptions/links.exceptions';
import { GrantRoles } from '../../../../src/grants';
import { GrantModel } from '../../../../src/grants/grants.schema';
import { GrantsService } from '../../../../src/grants/grants.service';
import { HoldersModel } from '../../../../src/holders/holders.schema';
import { HoldersService } from '../../../../src/holders/holders.service';
import { CryptoService } from '../../../../src/libs/crypto';
import { InvitationsService } from '../../../../src/links/invitations.service';
import { LinkNotificationsService } from '../../../../src/links/link-notifications.service';
import { LinkModel } from '../../../../src/links/links.schema';
import { LinksService } from '../../../../src/links/links.service';
import { User } from '../../../../src/users/users.schema';
import { UsersService } from '../../../../src/users/users.service';
import fixture from '../../../fixtures';
import { ApplicationFactory } from '../../../helpers/factories/application.factory';
import { GrantFactory } from '../../../helpers/factories/grant.factory';
import { UserFactory } from '../../../helpers/factories/user.factory';
import { silentLogger } from '../../../mocks/logger.mock';

const PASSWORD = 'StrongPassword123!';

describe('InvitationsService', () => {
  let invitations: InvitationsService;
  let applications: ApplicationsService;
  let users: UsersService;
  let grants: GrantsService;
  let holders: HoldersService;
  let links: LinksService;
  let telegramSend: ReturnType<typeof mock.fn>;
  let notifications: LinkNotificationsService;

  before(() => {
    const crypto = new CryptoService();
    applications = new ApplicationsService(ApplicationModel);
    users = new UsersService(User, crypto);
    grants = new GrantsService(GrantModel, applications, users);
    users.setGrantsCleaner(grants);
    holders = new HoldersService(HoldersModel, crypto);
    links = new LinksService(LinkModel, 60_000);
    telegramSend = mock.fn(() => Promise.resolve());
    notifications = new LinkNotificationsService({
      telegram: { sendMessage: telegramSend },
      usersService: users,
      ownerChatId: '999',
      logger: silentLogger,
      timeoutMs: 50,
    });
    invitations = new InvitationsService(
      links,
      users,
      holders,
      grants,
      applications,
      crypto,
      'https://app.test',
      notifications,
      silentLogger,
    );
  });

  const createApplication = () => {
    const application = ApplicationFactory.generate();
    return applications.create({
      name: application.name,
      slug: application.slug,
      audience: application.audience,
    });
  };

  test('should create a link without creating an account', async () => {
    const application = await createApplication();
    const created = await invitations.create({
      email: ' Guest@Example.com ',
      applicationId: application._id.toString(),
      role: GrantRoles.EDITOR,
    });

    assert.match(
      created.link,
      new RegExp(`^https://app\\.test/invitations/accept\\?token=.+$`),
    );
    assert.strictEqual(created.email, 'guest@example.com');
    assert.strictEqual(created.applicationId, application._id.toString());
    assert.strictEqual(created.role, GrantRoles.EDITOR);
    assert.ok(created.expiresAt.getTime() > Date.now());
    assert.strictEqual(await users.findByEmail('guest@example.com'), null);
  });

  test('should notify the invitee chat without persisting it on the user', async () => {
    const application = await createApplication();
    const created = await invitations.create({
      email: 'guest@example.com',
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
      telegramChatId: ' 4242 ',
    });

    assert.deepStrictEqual(created.notification, {
      delivered: true,
      recipient: 'invitee',
    });
    assert.strictEqual(telegramSend.mock.calls.at(-1)!.arguments[0], '4242');
    assert.ok(
      String(telegramSend.mock.calls.at(-1)!.arguments[1]).includes(
        'https://app.test/invitations/accept?token=',
      ),
    );

    const token = new URL(created.link).searchParams.get('token') as string;
    await invitations.accept({
      token,
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
    });

    const user = await users.findByEmail('guest@example.com');
    assert.ok(user);
    assert.strictEqual(user?.telegramChatId, undefined);
  });

  test('should fall back to the owner chat and survive a bot failure', async () => {
    const application = await createApplication();
    const notified = await invitations.create({
      email: 'guest@example.com',
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
    });

    assert.deepStrictEqual(notified.notification, {
      delivered: true,
      recipient: 'owner',
    });
    assert.strictEqual(telegramSend.mock.calls.at(-1)!.arguments[0], '999');

    telegramSend.mock.mockImplementationOnce(() =>
      Promise.reject(new Error('bot down')),
    );
    const failed = await invitations.create({
      email: 'other@example.com',
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
    });

    assert.strictEqual(failed.notification.delivered, false);
    assert.match(failed.link, /invitations\/accept\?token=.+/);
  });

  test('should reject a malformed telegram chat id before creating the link', async () => {
    const application = await createApplication();

    await assert.rejects(
      invitations.create({
        email: 'guest@example.com',
        applicationId: application._id.toString(),
        role: GrantRoles.VIEWER,
        telegramChatId: 'abc',
      }),
      InvalidArgumentError,
    );
    assert.strictEqual(
      await LinkModel.countDocuments({ email: 'guest@example.com' }),
      0,
    );
  });

  test('should reject an existing user or holder', async () => {
    const application = await createApplication();
    const user = await fixture.create(
      'User',
      UserFactory.generate({ verified: true }),
    );

    await assert.rejects(
      invitations.create({
        email: user.email,
        applicationId: application._id.toString(),
        role: GrantRoles.VIEWER,
      }),
      new InvalidArgumentError('Invitation could not be created'),
    );

    const holder = await holders.create('pending@example.com', PASSWORD);

    await assert.rejects(
      invitations.create({
        email: holder.email,
        applicationId: application._id.toString(),
        role: GrantRoles.VIEWER,
      }),
      new InvalidArgumentError('Invitation could not be created'),
    );
  });

  test('should remove a holder created after the invitation', async () => {
    const application = await createApplication();
    const created = await invitations.create({
      email: 'pending@example.com',
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
    });
    const token = new URL(created.link).searchParams.get('token') as string;

    await holders.create('pending@example.com', PASSWORD);

    await invitations.accept({
      token,
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
    });

    assert.strictEqual(await holders.findByEmail('pending@example.com'), null);
    const user = await users.findByEmail('pending@example.com');
    assert.ok(user);
    assert.strictEqual(user!.verified, true);
  });

  test('should reject an unknown application or invalid role', async () => {
    const application = await createApplication();

    await assert.rejects(
      invitations.create({
        email: 'guest@example.com',
        applicationId: '64b64c4f4f4f4f4f4f4f4f4f',
        role: GrantRoles.VIEWER,
      }),
      EntityNotFoundError,
    );

    await assert.rejects(
      invitations.create({
        email: 'guest@example.com',
        applicationId: application._id.toString(),
        role: 'superuser' as GrantRoles,
      }),
      new InvalidArgumentError('Invalid role'),
    );
  });

  test('should invalidate the previous invitation when reissued', async () => {
    const application = await createApplication();
    const first = await invitations.create({
      email: 'guest@example.com',
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
    });
    await invitations.create({
      email: 'guest@example.com',
      applicationId: application._id.toString(),
      role: GrantRoles.EDITOR,
    });

    const token = new URL(first.link).searchParams.get('token') as string;

    await assert.rejects(
      invitations.accept({
        token,
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
      }),
      InvalidLinkError,
    );
  });

  test('should reject an admin invitation from a non-owner', async () => {
    const application = await createApplication();

    await assert.rejects(
      invitations.create({
        email: 'guest@example.com',
        applicationId: application._id.toString(),
        role: GrantRoles.ADMIN,
        actorRole: Roles.ADMIN,
      }),
      new ForbiddenError('Only the owner can invite an admin'),
    );
  });

  test('should accept an invitation once and grant the role', async () => {
    const application = await createApplication();
    const created = await invitations.create({
      email: 'guest@example.com',
      applicationId: application._id.toString(),
      role: GrantRoles.ADMIN,
      actorRole: Roles.OWNER,
    });
    const token = new URL(created.link).searchParams.get('token') as string;

    await invitations.accept({
      token,
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
    });

    const user = await users.findByEmail('guest@example.com');
    assert.ok(user);
    assert.strictEqual(user!.verified, true);

    const grant = await grants.findByUserAndApplication(
      user!._id.toString(),
      application._id.toString(),
    );
    assert.strictEqual(grant?.role, GrantRoles.ADMIN);

    await assert.rejects(
      invitations.accept({
        token,
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
      }),
      InvalidLinkError,
    );
  });

  test('should reject an expired link without creating an account', async () => {
    const application = await createApplication();
    const created = await invitations.create({
      email: 'guest@example.com',
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
    });
    const token = new URL(created.link).searchParams.get('token') as string;

    await LinkModel.updateOne(
      { email: 'guest@example.com' },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    await assert.rejects(
      invitations.accept({
        token,
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
      }),
      InvalidLinkError,
    );
    assert.strictEqual(await users.findByEmail('guest@example.com'), null);
  });

  test('should let only one concurrent acceptance create an account', async () => {
    const application = await createApplication();
    const created = await invitations.create({
      email: 'guest@example.com',
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
    });
    const token = new URL(created.link).searchParams.get('token') as string;

    const results = await Promise.allSettled([
      invitations.accept({
        token,
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
      }),
      invitations.accept({
        token,
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
      }),
    ]);

    assert.strictEqual(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.strictEqual(
      await users.findByEmail('guest@example.com').then((user) => !!user),
      true,
    );
  });

  test('should roll back the account and release the link when the grant fails', async () => {
    const application = await createApplication();
    const created = await invitations.create({
      email: 'guest@example.com',
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
    });
    const token = new URL(created.link).searchParams.get('token') as string;

    await fixture.updateOne(
      'Application',
      { _id: application._id },
      {
        active: false,
      },
    );

    await assert.rejects(
      invitations.accept({
        token,
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
      }),
      EntityNotFoundError,
    );
    assert.strictEqual(await users.findByEmail('guest@example.com'), null);

    await fixture.updateOne(
      'Application',
      { _id: application._id },
      {
        active: true,
      },
    );

    await invitations.accept({
      token,
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
    });
    assert.ok(await users.findByEmail('guest@example.com'));
  });

  test('should validate the password', async () => {
    const application = await createApplication();
    const created = await invitations.create({
      email: 'guest@example.com',
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
    });
    const token = new URL(created.link).searchParams.get('token') as string;

    await assert.rejects(
      invitations.accept({
        token,
        password: 'weak',
        passwordConfirmation: 'weak',
      }),
      new InvalidArgumentError(
        'Password does not meet complexity requirements',
      ),
    );

    await assert.rejects(
      invitations.accept({
        token,
        password: PASSWORD,
        passwordConfirmation: 'DifferentPassword123!',
      }),
      new InvalidArgumentError(
        'Password and password confirmation do not match',
      ),
    );
  });
});

describe('InvitationsService.inviteMember', () => {
  let applications: ApplicationsService;
  let users: UsersService;
  let grants: GrantsService;
  let holders: HoldersService;
  let links: LinksService;
  let notifications: LinkNotificationsService;
  let invitationMailer: { sendInvitationEmail: ReturnType<typeof mock.fn> };

  before(() => {
    const crypto = new CryptoService();
    applications = new ApplicationsService(ApplicationModel);
    users = new UsersService(User, crypto);
    grants = new GrantsService(GrantModel, applications, users);
    users.setGrantsCleaner(grants);
    holders = new HoldersService(HoldersModel, crypto);
    links = new LinksService(LinkModel, 60_000);
    notifications = new LinkNotificationsService({
      telegram: null,
      usersService: users,
      logger: silentLogger,
    });
    invitationMailer = {
      sendInvitationEmail: mock.fn(() => Promise.resolve()),
    };
  });

  beforeEach(() => {
    invitationMailer.sendInvitationEmail.mock.resetCalls();
  });

  const buildService = () =>
    new InvitationsService(
      links,
      users,
      holders,
      grants,
      applications,
      new CryptoService(),
      'https://app.test',
      notifications,
      silentLogger,
      invitationMailer,
    );

  const createApplication = async () => {
    const application = ApplicationFactory.generate();

    return applications.create({
      name: application.name,
      slug: application.slug,
      audience: application.audience,
    });
  };

  test('creates the link and emails it to an email without an account', async () => {
    const service = buildService();
    const application = await createApplication();
    const email = `invite-${Date.now()}@example.com`;

    await service.inviteMember({
      email,
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
    });

    assert.strictEqual(
      invitationMailer.sendInvitationEmail.mock.callCount(),
      1,
    );
    const [to, link] = invitationMailer.sendInvitationEmail.mock.calls[0]!
      .arguments as [string, string];
    assert.strictEqual(to, email);
    assert.match(link, /\/invitations\/accept\?token=/);
    assert.strictEqual(await users.findByEmail(email), null);
  });

  test('rejects an existing account and does not email it', async () => {
    const service = buildService();
    const application = await createApplication();
    const user = await fixture.create(
      'User',
      UserFactory.generate({ email: `existing-${Date.now()}@example.com` }),
    );

    await assert.rejects(
      service.inviteMember({
        email: user.email,
        applicationId: application._id.toString(),
        role: GrantRoles.VIEWER,
      }),
      new InvalidArgumentError('Invitation could not be created'),
    );
    assert.strictEqual(
      invitationMailer.sendInvitationEmail.mock.callCount(),
      0,
    );
  });

  test('invites a pre-verification holder', async () => {
    const service = buildService();
    const application = await createApplication();
    const holder = (await fixture.create('Holder', {
      _id: new Types.ObjectId(),
      email: `holder-${Date.now()}@example.com`,
      password: 'hashedpassword',
      expiresAt: new Date(Date.now() + 60_000),
    })) as { email: string };

    await service.inviteMember({
      email: holder.email,
      applicationId: application._id.toString(),
      role: GrantRoles.EDITOR,
    });

    assert.strictEqual(
      invitationMailer.sendInvitationEmail.mock.callCount(),
      1,
    );
  });

  test('accepting an invitation for an already verified account attaches the grant', async () => {
    const service = buildService();
    const application = await createApplication();
    const email = `verified-${Date.now()}@example.com`;
    const created = await service.create({
      email,
      applicationId: application._id.toString(),
      role: GrantRoles.EDITOR,
    });
    const token = new URL(created.link).searchParams.get('token') as string;
    assert.ok(token);

    const user = await fixture.create(
      'User',
      UserFactory.generate({ email, verified: true }),
    );

    await service.accept({
      token,
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
    });

    const grants = await fixture.find(GrantModel.modelName, {
      userId: user._id,
      applicationId: application._id,
    });
    assert.strictEqual(grants.length, 1);
    assert.strictEqual(
      (grants[0] as { role: GrantRoles }).role,
      GrantRoles.EDITOR,
    );
    const usersWithEmail = await fixture.find('User', { email });
    assert.strictEqual(usersWithEmail.length, 1);
  });

  test('does not demote an existing admin when a stale invitation is accepted', async () => {
    const service = buildService();
    const application = await createApplication();
    const email = `admin-member-${Date.now()}@example.com`;
    const created = await service.create({
      email,
      applicationId: application._id.toString(),
      role: GrantRoles.VIEWER,
    });
    const user = await fixture.create(
      'User',
      UserFactory.generate({ email, verified: true }),
    );
    await fixture.create(
      'Grant',
      GrantFactory.generate({
        userId: user._id,
        applicationId: application._id,
        role: GrantRoles.ADMIN,
      }),
    );
    const token = new URL(created.link).searchParams.get('token') as string;

    await service.accept({
      token,
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
    });

    const grant = await fixture.findOne(GrantModel.modelName, {
      userId: user._id,
      applicationId: application._id,
    });
    assert.strictEqual((grant as { role: GrantRoles }).role, GrantRoles.ADMIN);
  });

  test('rejects an inactive application without sending an email', async () => {
    const service = buildService();
    const application = await createApplication();

    await ApplicationModel.updateOne(
      { _id: application._id },
      { active: false },
    );

    await assert.rejects(
      service.inviteMember({
        email: `inactive-${Date.now()}@example.com`,
        applicationId: application._id.toString(),
        role: GrantRoles.VIEWER,
      }),
      new EntityNotFoundError('Application not found'),
    );
    assert.strictEqual(
      invitationMailer.sendInvitationEmail.mock.callCount(),
      0,
    );
  });
});
