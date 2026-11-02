import type { SessionService } from '../auth/tokens/session.service';
import { PASSWORD_REGEX } from '../common/constants/regex';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { InvalidLinkError } from '../common/exceptions/links.exceptions';
import { assertObjectId } from '../common/validators/object-id';
import { LoggerInterface } from '../libs/logger';
import type { UsersPort } from '../users';
import { buildPasswordResetLink } from './link-urls';
import { LinkType } from './link.interface';
import type { LinksPort } from './links.port';

export interface CreatePasswordResetLinkResult {
  link: string;
  expiresAt: Date;
  userId: string;
}

export interface AcceptPasswordResetLinkInput {
  token: string;
  newPassword: string;
  passwordConfirmation: string;
}

export class PasswordResetLinksService {
  constructor(
    private readonly linksService: LinksPort,
    private readonly usersService: UsersPort,
    private readonly sessionService: SessionService,
    private readonly publicAppUrl: string,
    private readonly logger: LoggerInterface,
  ) {}

  async create(userId: string): Promise<CreatePasswordResetLinkResult> {
    assertObjectId(userId, 'userId');

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    const created = await this.linksService.createPasswordReset({ userId });

    return {
      link: buildPasswordResetLink(this.publicAppUrl, created.token),
      expiresAt: created.link.expiresAt,
      userId,
    };
  }

  async accept(input: AcceptPasswordResetLinkInput): Promise<void> {
    this.validatePassword(input.newPassword, input.passwordConfirmation);

    if (!input.token) {
      throw new InvalidLinkError();
    }

    const link = await this.linksService.consume(
      input.token,
      LinkType.PASSWORD_RESET,
    );
    const userId = link.userId?.toString();

    if (!userId) {
      throw new InvalidLinkError();
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new InvalidLinkError();
    }

    try {
      await this.usersService.setPassword(userId, input.newPassword);
    } catch (error) {
      try {
        await this.linksService.release(link._id.toString());
      } catch (releaseError) {
        this.logger.warn(
          `Failed to release password reset link ${link._id.toString()}`,
          releaseError,
        );
      }
      throw error;
    }

    // The password is already changed and the link consumed, so a revocation
    // failure must not turn the reset into an error the user would retry.
    try {
      await this.sessionService.revokeAll(userId);
    } catch (error) {
      this.logger.warn(
        `Failed to revoke sessions after password reset for user ${userId}`,
        error,
      );
    }
  }

  private validatePassword(
    newPassword: string,
    passwordConfirmation: string,
  ): void {
    if (!newPassword) {
      throw new InvalidArgumentError('newPassword is required');
    }
    if (!PASSWORD_REGEX.test(newPassword)) {
      throw new InvalidArgumentError(
        'Password does not meet complexity requirements',
      );
    }
    if (!passwordConfirmation) {
      throw new InvalidArgumentError('passwordConfirmation is required');
    }
    if (newPassword !== passwordConfirmation) {
      throw new InvalidArgumentError(
        'Password and password confirmation do not match',
      );
    }
  }
}
