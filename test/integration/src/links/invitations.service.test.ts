import { ApplicationModel } from '../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../src/applications/applications.service';
import {
  EntityAlreadyExistsError,
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
import { LinkModel } from '../../../../src/links/links.schema';
import { LinksService } from '../../../../src/links/links.service';
import { User } from '../../../../src/users/users.schema';
import { UsersService } from '../../../../src/users/users.service';
import fixture from '../../../fixtures';
import { ApplicationFactory } from '../../../helpers/factories/application.factory';
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

  before(() => {
    const crypto = new CryptoService();
    applications = new ApplicationsService(ApplicationModel);
    users = new UsersService(User, crypto);
    grants = new GrantsService(GrantModel, applications, users);
    users.setGrantsCleaner(grants);
    holders = new HoldersService(HoldersModel, crypto);
    links = new LinksService(LinkModel, 60_000);
    invitations = new InvitationsService(
      links,
      users,
      holders,
      grants,
      applications,
      crypto,
      'https://app.test',
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
      EntityAlreadyExistsError,
    );

    const holder = await holders.create('pending@example.com', PASSWORD);

    await assert.rejects(
      invitations.create({
        email: holder.email,
        applicationId: application._id.toString(),
        role: GrantRoles.VIEWER,
      }),
      EntityAlreadyExistsError,
    );
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

  test('should accept an invitation once and grant the role', async () => {
    const application = await createApplication();
    const created = await invitations.create({
      email: 'guest@example.com',
      applicationId: application._id.toString(),
      role: GrantRoles.ADMIN,
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
