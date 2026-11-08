import type { Application, ApplicationsPort } from '../../applications';
import { ForbiddenError } from '../../common/exceptions/auth.exceptions';
import { InvalidArgumentError } from '../../common/exceptions/base.exception';
import { assertObjectId } from '../../common/validators/object-id';
import type { GrantsPort } from '../../grants';
import { GrantRoles } from '../../grants';
import { JwtService } from '../../libs/jwt';
import type { User, UsersPort } from '../../users';

export interface IssuedApplicationToken {
  accessToken: string;
  audience: string;
  role: GrantRoles;
}

export interface ApplicationAccess {
  application: Application;
  role: GrantRoles;
}

/** Result of resolving an identifier, keeping inactive documents for auditing. */
export interface ResolvedApplication {
  application: Application;
  active: boolean;
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

  /**
   * Resolves an application by slug or audience without a user. An inactive
   * document is returned with `active: false` so the audit trail can keep its
   * identity; `null` means the identifier does not exist.
   */
  async resolveApplication(
    applicationIdentifier: string,
  ): Promise<ResolvedApplication | null> {
    if (!applicationIdentifier || !applicationIdentifier.trim()) {
      throw new InvalidArgumentError('Application identifier is required');
    }

    const application = await this.applicationsService.findBySlugOrAudience(
      applicationIdentifier,
    );

    return application === null
      ? null
      : { application, active: application.active };
  }

  async resolveAccess(
    userId: string,
    applicationIdentifier: string,
    loadedUser?: User,
  ): Promise<ApplicationAccess> {
    assertObjectId(userId, 'userId');

    const resolved = await this.resolveApplication(applicationIdentifier);

    return this.authorize(userId, resolved?.application ?? null, loadedUser);
  }

  /** Authorizes against an application the caller already resolved. */
  async authorizeResolved(
    userId: string,
    application: Application,
    loadedUser?: User,
  ): Promise<ApplicationAccess> {
    assertObjectId(userId, 'userId');

    return this.authorize(userId, application, loadedUser);
  }

  /**
   * Resolves access from an audience claim. The value is unambiguous, so it
   * must never fall back to a slug lookup: another application's slug could
   * otherwise match the audience and yield a role for the wrong application.
   */
  async resolveAccessByAudience(
    userId: string,
    audience: string,
    loadedUser?: User,
  ): Promise<ApplicationAccess> {
    assertObjectId(userId, 'userId');

    if (!audience || !audience.trim()) {
      throw new InvalidArgumentError('Audience is required');
    }

    const application = await this.applicationsService.findByAudience(
      audience.trim(),
    );

    return this.authorize(userId, application, loadedUser);
  }

  private async authorize(
    userId: string,
    application: Application | null,
    loadedUser?: User,
  ): Promise<ApplicationAccess> {
    const user = loadedUser ?? (await this.usersService.findById(userId));

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
