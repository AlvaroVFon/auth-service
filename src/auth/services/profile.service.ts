import { EntityNotFoundError } from '../../common/exceptions/base.exception';
import { TokenBlacklistPort } from '../../common/ports/token-blacklist.port';
import { JwtService, TokenRole, TokenTypes } from '../../libs/jwt';
import { UsersPort } from '../../users';

export interface TokenIdentity {
  id: string;
  role: TokenRole;
  audience?: string;
  expiresAt?: Date;
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
      expiresAt: identity.expiresAt ?? new Date(),
    };
  }

  async introspect(
    token: string,
    caller: TokenIdentity,
  ): Promise<TokenIntrospectionResult> {
    try {
      const claims = this.jwtService.verifyToken(token);

      if (
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
    } catch {
      return { active: false };
    }
  }
}
