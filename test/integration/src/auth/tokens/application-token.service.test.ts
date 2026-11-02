import { Types } from 'mongoose';

import { ApplicationModel } from '../../../../../src/applications/applications.schema';
import { ApplicationsService } from '../../../../../src/applications/applications.service';
import { ApplicationTokenService } from '../../../../../src/auth/tokens/application-token.service';
import { ForbiddenError } from '../../../../../src/common/exceptions/auth.exceptions';
import { InvalidArgumentError } from '../../../../../src/common/exceptions/base.exception';
import { GrantRoles } from '../../../../../src/grants/grants.interface';
import { GrantModel } from '../../../../../src/grants/grants.schema';
import { GrantsService } from '../../../../../src/grants/grants.service';
import { CryptoService } from '../../../../../src/libs/crypto/crypto.service';
import { JwtKeyring } from '../../../../../src/libs/jwt';
import { JwtService } from '../../../../../src/libs/jwt/jwt.service';
import { TokenTypes } from '../../../../../src/libs/jwt/token-types.enum';
import { User as UserInterface } from '../../../../../src/users/users.interface';
import { User } from '../../../../../src/users/users.schema';
import { UsersService } from '../../../../../src/users/users.service';
import fixture from '../../../../fixtures';
import { ApplicationFactory } from '../../../../helpers/factories/application.factory';
import { UserFactory } from '../../../../helpers/factories/user.factory';
import { createRsaKeyPair } from '../../../../helpers/jwt-keyring.helper';

describe('ApplicationTokenService', () => {
  let applicationsService: ApplicationsService;
  let grantsService: GrantsService;
  let jwtService: JwtService;
  let usersService: UsersService;
  let service: ApplicationTokenService;

  before(() => {
    applicationsService = new ApplicationsService(ApplicationModel);
    usersService = new UsersService(User, new CryptoService());
    grantsService = new GrantsService(
      GrantModel,
      applicationsService,
      usersService,
    );
    jwtService = new JwtService(
      new JwtKeyring([{ ...createRsaKeyPair(), active: true }]),
      3600,
      86400,
      { issuer: 'auth-service-test' },
    );
    service = new ApplicationTokenService(
      jwtService,
      applicationsService,
      grantsService,
      usersService,
    );
  });

  const createUserAndApplication = async () => {
    const user = await fixture.create<UserInterface>(
      'User',
      UserFactory.generate({ verified: true }),
    );
    const application = ApplicationFactory.generate();
    const createdApplication = await applicationsService.create({
      name: application.name,
      slug: application.slug,
      audience: application.audience,
    });

    return { userId: String(user._id), application: createdApplication };
  };

  test('should issue an access token scoped to the application and grant role', async () => {
    const { userId, application } = await createUserAndApplication();
    await grantsService.assignRole({
      userId,
      applicationId: String(application._id),
      role: GrantRoles.EDITOR,
    });

    const issued = await service.issueAccessToken(
      userId,
      String(application._id),
    );

    const claims = jwtService.verifyToken(issued.accessToken, {
      audience: application.audience,
    });
    assert.strictEqual(claims.aud, application.audience);
    assert.strictEqual(claims.role, GrantRoles.EDITOR);
    assert.strictEqual(claims.sub, userId);
    assert.strictEqual(claims.type, TokenTypes.ACCESS);
    assert.strictEqual(claims.iss, 'auth-service-test');
    assert.ok(claims.jti);
    assert.ok(claims.exp > 0);
  });

  test('should resolve access from a slug or an audience', async () => {
    const { userId, application } = await createUserAndApplication();
    await grantsService.assignRole({
      userId,
      applicationId: String(application._id),
      role: GrantRoles.ADMIN,
    });

    const bySlug = await service.resolveAccess(userId, application.slug);
    const byAudience = await service.resolveAccess(
      userId,
      application.audience,
    );

    assert.strictEqual(bySlug.role, GrantRoles.ADMIN);
    assert.strictEqual(bySlug.application.audience, application.audience);
    assert.strictEqual(byAudience.application.audience, application.audience);
  });

  test('should reject an inactive application on resolveAccess', async () => {
    const { userId, application } = await createUserAndApplication();
    await grantsService.assignRole({
      userId,
      applicationId: String(application._id),
      role: GrantRoles.VIEWER,
    });
    await ApplicationModel.updateOne(
      { _id: application._id },
      { active: false },
    );

    await assert.rejects(
      service.resolveAccess(userId, application.slug),
      ForbiddenError,
    );
  });

  test('should reject a blank application identifier', async () => {
    const { userId } = await createUserAndApplication();

    await assert.rejects(
      service.resolveAccess(userId, '   '),
      InvalidArgumentError,
    );
  });

  test('should reject a user without a grant on the application', async () => {
    const { userId, application } = await createUserAndApplication();

    await assert.rejects(
      service.issueAccessToken(userId, String(application._id)),
      ForbiddenError,
    );
  });

  test('should reject an unverified user', async () => {
    const user = await fixture.create<UserInterface>(
      'User',
      UserFactory.generate({ verified: false }),
    );
    const application = ApplicationFactory.generate();
    const createdApplication = await applicationsService.create({
      name: application.name,
      slug: application.slug,
      audience: application.audience,
    });
    await grantsService.assignRole({
      userId: String(user._id),
      applicationId: String(createdApplication._id),
      role: GrantRoles.VIEWER,
    });

    await assert.rejects(
      service.issueAccessToken(
        String(user._id),
        String(createdApplication._id),
      ),
      new ForbiddenError('Email is not verified'),
    );
  });

  test('should reject an inactive application', async () => {
    const { userId, application } = await createUserAndApplication();
    await GrantModel.create({
      userId: new Types.ObjectId(userId),
      applicationId: application._id,
      role: GrantRoles.VIEWER,
    });
    await ApplicationModel.updateOne(
      { _id: application._id },
      { active: false },
    );

    await assert.rejects(
      service.issueAccessToken(userId, String(application._id)),
      ForbiddenError,
    );
  });

  test('should hide a deleted user behind a forbidden response', async () => {
    const { userId, application } = await createUserAndApplication();
    await grantsService.assignRole({
      userId,
      applicationId: String(application._id),
      role: GrantRoles.VIEWER,
    });
    await fixture.deleteOne('User', { _id: userId });

    await assert.rejects(
      service.issueAccessToken(userId, String(application._id)),
      new ForbiddenError('User has no access to this application'),
    );
  });

  test('should reject invalid identifiers', async () => {
    await assert.rejects(
      service.issueAccessToken('bad', 'bad'),
      InvalidArgumentError,
    );
  });
});
