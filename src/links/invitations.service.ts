import type { ApplicationsPort } from '../applications';
import { PASSWORD_REGEX } from '../common/constants/regex';
import { normalizeEmail } from '../common/email';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { InvalidLinkError } from '../common/exceptions/links.exceptions';
import { normalizeTelegramChatId } from '../common/telegram-chat-id';
import type { GrantsPort } from '../grants';
import { GrantRoles } from '../grants';
import type { HoldersPort } from '../holders';
import { CryptoService } from '../libs/crypto';
import { LoggerInterface } from '../libs/logger';
import type { UsersPort } from '../users';
import {
  LinkNotificationsService,
  LinkNotificationResult,
} from './link-notifications.service';
import { buildInvitationLink } from './link-urls';
import { LinkType } from './link.interface';
import type { LinksPort } from './links.port';

export interface CreateInvitationInput {
  email: string;
  applicationId: string;
  role: GrantRoles;
  telegramChatId?: string;
}

export interface CreatedInvitation {
  link: string;
  expiresAt: Date;
  email: string;
  applicationId: string;
  role: GrantRoles;
  notification: LinkNotificationResult;
}

export interface AcceptInvitationInput {
  token: string;
  password: string;
  passwordConfirmation: string;
}

export class InvitationsService {
  constructor(
    private readonly linksService: LinksPort,
    private readonly usersService: UsersPort,
    private readonly holdersService: HoldersPort,
    private readonly grantsService: GrantsPort,
    private readonly applicationsService: ApplicationsPort,
    private readonly cryptoService: CryptoService,
    private readonly publicAppUrl: string,
    private readonly notifications: LinkNotificationsService,
    private readonly logger: LoggerInterface,
  ) {}

  async create(input: CreateInvitationInput): Promise<CreatedInvitation> {
    const email = normalizeEmail(input.email ?? '');

    const telegramChatId = normalizeTelegramChatId(input.telegramChatId);

    const application = await this.applicationsService.findAssignableById(
      input.applicationId,
    );
    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    const existingUser = await this.usersService.findByEmail(email);
    const existingHolder = await this.holdersService.findByEmail(email);
    if (existingUser || existingHolder) {
      // Keep the response generic: a per-app admin must not be able to probe
      // whether an email has an account anywhere in the service.
      throw new InvalidArgumentError('Invitation could not be created');
    }

    const created = await this.linksService.createInvitation({
      email,
      applicationId: input.applicationId,
      role: input.role,
      ...(telegramChatId === undefined ? {} : { telegramChatId }),
    });

    const link = buildInvitationLink(this.publicAppUrl, created.token);
    const notification = await this.notifications.notifyInvitation({
      linkId: created.link._id.toString(),
      link,
      ...(telegramChatId === undefined ? {} : { chatId: telegramChatId }),
    });

    return {
      link,
      expiresAt: created.link.expiresAt,
      email,
      applicationId: input.applicationId,
      role: input.role,
      notification,
    };
  }

  async accept(input: AcceptInvitationInput): Promise<void> {
    this.validatePassword(input.password, input.passwordConfirmation);

    if (!input.token) {
      throw new InvalidLinkError();
    }

    const link = await this.linksService.consume(
      input.token,
      LinkType.INVITATION,
    );

    if (!link.email || !link.applicationId || !link.role) {
      throw new InvalidLinkError();
    }

    const passwordHash = await this.cryptoService.hashString(input.password);

    let user;
    try {
      user = await this.usersService.createVerifiedUser({
        email: link.email,
        passwordHash,
        ...(link.telegramChatId === undefined
          ? {}
          : { telegramChatId: link.telegramChatId }),
      });
    } catch (error) {
      await this.release(link._id.toString());
      throw error;
    }

    // The invitee may have signed up (holder) after the link was created. The
    // verified account replaces that staging holder so it cannot be orphaned.
    const holder = await this.holdersService.findByEmail(link.email);
    if (holder) {
      try {
        await this.holdersService.deleteById(holder._id.toString());
      } catch (error) {
        this.logger.warn(
          `Failed to remove holder ${holder._id.toString()}`,
          error,
        );
      }
    }

    const userId = user._id.toString();
    try {
      await this.grantsService.assignRole({
        userId,
        applicationId: link.applicationId.toString(),
        role: link.role,
      });
    } catch (error) {
      await Promise.allSettled([
        this.usersService.deleteOneById(userId),
        this.linksService.release(link._id.toString()),
      ]);
      throw error;
    }
  }

  private validatePassword(
    password: string,
    passwordConfirmation: string,
  ): void {
    if (!password) {
      throw new InvalidArgumentError('password is required');
    }
    if (!PASSWORD_REGEX.test(password)) {
      throw new InvalidArgumentError(
        'Password does not meet complexity requirements',
      );
    }
    if (!passwordConfirmation) {
      throw new InvalidArgumentError('passwordConfirmation is required');
    }
    if (password !== passwordConfirmation) {
      throw new InvalidArgumentError(
        'Password and password confirmation do not match',
      );
    }
  }

  private async release(linkId: string): Promise<void> {
    try {
      await this.linksService.release(linkId);
    } catch (error) {
      this.logger.warn(`Failed to release invitation link ${linkId}`, error);
    }
  }
}
