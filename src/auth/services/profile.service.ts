import type { Application, ApplicationsPort } from '../../applications';
import { Roles } from '../../common/enums/roles.enum';
import { EntityNotFoundError } from '../../common/exceptions/base.exception';
import { TokenBlacklistPort } from '../../common/ports/token-blacklist.port';
import type { GrantsPort } from '../../grants';
import { GrantRoles } from '../../grants';
import { JwtService, TokenClaims, TokenRole, TokenTypes } from '../../libs/jwt';
import { UsersPort } from '../../users';

/** Role of an application in the panel context: the owner or a grant role. */
export type ContextRole = Roles.OWNER | GrantRoles;

export interface TokenIdentity {
  id: string;
  role: TokenRole;
  audience?: string;
  expiresAt: Date;
}

export interface UserContext {
  id: string;
  email: string;
  verified: boolean;
  mfaEnabled: boolean;
}

export interface ApplicationContext {
  id: string;
  name: string;
  slug: string;
  audience: string;
  active: boolean;
  role: ContextRole;
}

export interface AuthContext {
  user: UserContext;
  /** Global role of the account: `owner`, `user` or the legacy `admin`. */
  role: Roles;
  applications: ApplicationContext[];
}

export interface UserProfile {
  id: string;
  email: string;
  application: string | null;
  role: TokenRole;
  expiresAt: Date;
}

export type TokenIntrospectionResult =
  | { active: false }
  | {
      active: true;
      id: string;
      application: string | null;
      role: TokenRole;
      expiresAt: Date;
    };

export class ProfileService {
  constructor(
    private readonly usersService: UsersPort,
    private readonly jwtService: JwtService,
    private readonly blacklistService: TokenBlacklistPort,
    private readonly grantsService: GrantsPort,
    private readonly applicationsService: ApplicationsPort,
  ) {}

  async getProfile(identity: TokenIdentity): Promise<UserProfile> {
    const user = await this.usersService.findById(identity.id);

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    return {
      id: identity.id,
      email: user.email,
      application: identity.audience ?? null,
      role: identity.role,
      expiresAt: identity.expiresAt,
    };
  }

  async getContext(identity: TokenIdentity): Promise<AuthContext> {
    const user = await this.usersService.findById(identity.id);

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    // The owner branch follows the account role, not the presented token: an
    // owner can log in with an application scope and then carry a grant role.
    const applications =
      user.role === Roles.OWNER
        ? (await this.applicationsService.findAll()).map((application) =>
            this.toApplicationContext(application, Roles.OWNER),
          )
        : (await this.grantsService.listActiveByUser(identity.id)).map(
            ({ application, role }) =>
              this.toApplicationContext(application, role),
          );

    return {
      user: {
        id: identity.id,
        email: user.email,
        verified: user.verified,
        mfaEnabled: user.mfaEnabled ?? false,
      },
      role: user.role,
      applications: applications.sort(this.compareApplicationContexts),
    };
  }

  async introspect(
    token: string,
    caller: TokenIdentity,
  ): Promise<TokenIntrospectionResult> {
    const claims = this.verify(token);

    if (
      !claims ||
      claims.type !== TokenTypes.ACCESS ||
      !claims.userId ||
      !claims.jti ||
      !claims.role ||
      typeof claims.exp !== 'number'
    ) {
      return { active: false };
    }

    // A caller can only introspect its own tokens, and never across apps.
    if (claims.userId !== caller.id) {
      return { active: false };
    }

    if ((claims.aud ?? null) !== (caller.audience ?? null)) {
      return { active: false };
    }

    if (await this.blacklistService.isBlacklisted(claims.jti)) {
      return { active: false };
    }

    const user = await this.usersService.findById(claims.userId);

    if (!user) {
      return { active: false };
    }

    return {
      active: true,
      id: claims.userId,
      application: claims.aud ?? null,
      role: claims.role,
      expiresAt: new Date(claims.exp * 1000),
    };
  }

  private toApplicationContext(
    application: Application,
    role: ContextRole,
  ): ApplicationContext {
    return {
      id: application._id.toString(),
      name: application.name,
      slug: application.slug,
      audience: application.audience,
      active: application.active,
      role,
    };
  }

  /**
   * The panel renders this order directly, so keep it stable across requests
   * instead of relying on MongoDB's natural order.
   */
  private compareApplicationContexts(
    left: ApplicationContext,
    right: ApplicationContext,
  ): number {
    if (left.name !== right.name) {
      return left.name < right.name ? -1 : 1;
    }
    if (left.slug !== right.slug) {
      return left.slug < right.slug ? -1 : 1;
    }
    if (left.id === right.id) {
      return 0;
    }

    return left.id < right.id ? -1 : 1;
  }

  /**
   * Only signature/expiry failures collapse to an inactive token. Blacklist
   * and user lookups run outside the catch so an infrastructure outage is not
   * silently reported as a revoked token.
   */
  private verify(token: string): TokenClaims | null {
    try {
      return this.jwtService.verifyToken(token);
    } catch {
      return null;
    }
  }
}
