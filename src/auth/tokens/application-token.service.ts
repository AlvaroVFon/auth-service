import type { Application, ApplicationsPort } from '../../applications';
import { ForbiddenError } from '../../common/exceptions/auth.exceptions';
import { InvalidArgumentError } from '../../common/exceptions/base.exception';
import { assertObjectId } from '../../common/validators/object-id';
import type { GrantsPort } from '../../grants';
import { GrantRoles } from '../../grants';
import { JwtService } from '../../libs/jwt';
import type { UsersPort } from '../../users';

export interface IssuedApplicationToken {
  accessToken: string;
  audience: string;
  role: GrantRoles;
}

export interface ApplicationAccess {
  application: Application;
  role: GrantRoles;
}

export class ApplicationTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly applicationsService: ApplicationsPort,
    private readonly grantsService: GrantsPort,
    private readonly usersService: UsersPort,
  ) {}

  async issueAccessToken(
    userId: string,
    applicationId: string,
  ): Promise<IssuedApplicationToken> {
    assertObjectId(userId, 'userId');
    assertObjectId(applicationId, 'applicationId');

    const application =
      await this.applicationsService.findAssignableById(applicationId);
    const access = await this.authorize(userId, application);

    return {
      accessToken: this.jwtService.signAccessToken(
        userId,
        access.role,
        access.application.audience,
      ),
      audience: access.application.audience,
      role: access.role,
    };
  }

  async resolveAccess(
    userId: string,
    applicationIdentifier: string,
  ): Promise<ApplicationAccess> {
    assertObjectId(userId, 'userId');

    if (!applicationIdentifier || !applicationIdentifier.trim()) {
      throw new InvalidArgumentError('Application identifier is required');
    }

    const application = await this.applicationsService.findBySlugOrAudience(
      applicationIdentifier,
    );

    return this.authorize(userId, application);
  }

  private async authorize(
    userId: string,
    application: Application | null,
  ): Promise<ApplicationAccess> {
    const user = await this.usersService.findById(userId);

    // Collapse "missing user", "inactive application" and "no grant" into one
    // response so the caller cannot use this path to enumerate ids.
    if (!application || !application.active || !user) {
      throw new ForbiddenError('User has no access to this application');
    }

    if (!user.verified) {
      throw new ForbiddenError('Email is not verified');
    }

    const grant = await this.grantsService.findByUserAndApplication(
      userId,
      application._id.toString(),
    );

    if (!grant) {
      throw new ForbiddenError('User has no access to this application');
    }

    return { application, role: grant.role };
  }
}
