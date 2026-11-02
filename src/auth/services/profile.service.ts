import { EntityNotFoundError } from '../../common/exceptions/base.exception';
import { TokenBlacklistPort } from '../../common/ports/token-blacklist.port';
import { JwtService, TokenClaims, TokenRole, TokenTypes } from '../../libs/jwt';
import { UsersPort } from '../../users';

export interface TokenIdentity {
  id: string;
  role: TokenRole;
  audience?: string;
  expiresAt: Date;
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
