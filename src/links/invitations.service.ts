import type { ApplicationsPort } from '../applications';
import { AuditEvent, AuditPort, AuditResult } from '../audit';
import { EMAIL_REGEX, PASSWORD_REGEX } from '../common/constants/regex';
import { normalizeEmail } from '../common/email';
import { Roles } from '../common/enums/roles.enum';
import { ForbiddenError } from '../common/exceptions/auth.exceptions';
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
import type {
  InvitationMailerPort,
  InviteMemberInput,
} from './invitations.port';
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
  /** Global role of the caller; only the owner may invite an admin. */
  actorRole?: Roles;
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
    private readonly invitationMailer?: InvitationMailerPort,
    private readonly auditService?: AuditPort,
  ) {}

  /**
   * Revokes one pending invitation of an application without deleting it.
   * A repeated revocation is an idempotent no-op and is not audited again.
   */
  async revoke(
    applicationId: string,
    invitationId: string,
    actorId?: string,
  ): Promise<void> {
    const application = await this.findApplication(applicationId);
    const revoked = await this.linksService.revokeInvitation(
      application._id.toString(),
      invitationId,
    );

    if (!revoked) {
      return;
    }

    await this.auditService?.record({
      event: AuditEvent.INVITATION_REVOKED,
      result: AuditResult.SUCCESS,
      applicationId: application._id.toString(),
      ...(actorId === undefined ? {} : { actorId }),
    });
  }

  async create(input: CreateInvitationInput): Promise<CreatedInvitation> {
    if (input.role === GrantRoles.ADMIN && input.actorRole !== Roles.OWNER) {
      throw new ForbiddenError('Only the owner can invite an admin');
    }

    const email = normalizeEmail(input.email ?? '');
    const telegramChatId = normalizeTelegramChatId(input.telegramChatId);
    const application = await this.findApplication(input.applicationId);

    const created = await this.buildInvitation({
      email,
      application,
      role: input.role,
      ...(telegramChatId === undefined ? {} : { telegramChatId }),
      allowHolder: false,
    });

    return {
      link: created.link,
      expiresAt: created.created.link.expiresAt,
      email,
      applicationId: input.applicationId,
      role: input.role,
      notification: created.notification,
    };
  }

  /**
   * Invites an email that has no account. A pre-verification holder is a valid
   * target here, unlike the public invitation flow, because the member is being
   * onboarded by an administrator.
   */
  async inviteMember(input: InviteMemberInput): Promise<void> {
    if (input.role === GrantRoles.ADMIN && input.actorRole !== Roles.OWNER) {
      throw new ForbiddenError('Only the owner can invite an admin');
    }

    const email = normalizeEmail(input.email ?? '');

    if (!EMAIL_REGEX.test(email)) {
      throw new InvalidArgumentError('Invalid email format');
    }

    const application =
      input.application ?? (await this.findApplication(input.applicationId));

    const created = await this.buildInvitation({
      email,
      application,
      role: input.role,
      allowHolder: true,
    });

    if (this.invitationMailer) {
      try {
        await this.invitationMailer.sendInvitationEmail(email, created.link);
      } catch (error) {
        // Delivery is best effort: the link exists and the caller already has a
        // successful response shape, so a mailer outage must not fail the grant.
        this.logger.warn(
          `Failed to email invitation link ${created.created.link._id.toString()}`,
          error,
        );
      }
    }
  }

  private async findApplication(applicationId: string) {
    const application =
      await this.applicationsService.findAssignableById(applicationId);

    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    return application;
  }

  private async buildInvitation(input: {
    email: string;
    application: {
      _id: { toString(): string };
      active: boolean;
    };
    role: GrantRoles;
    telegramChatId?: string;
    allowHolder: boolean;
  }) {
    const existingUser = await this.usersService.findByEmail(input.email);
    const existingHolder = input.allowHolder
      ? null
      : await this.holdersService.findByEmail(input.email);

    if (existingUser || existingHolder) {
      // Keep the response generic: a per-app admin must not be able to probe
      // whether an email has an account anywhere in the service.
      throw new InvalidArgumentError('Invitation could not be created');
    }

    const created = await this.linksService.createInvitation({
      email: input.email,
      applicationId: input.application._id.toString(),
      role: input.role,
      ...(input.telegramChatId === undefined
        ? {}
        : { telegramChatId: input.telegramChatId }),
    });

    const link = buildInvitationLink(this.publicAppUrl, created.token);
    const notification = await this.notifications.notifyInvitation({
      linkId: created.link._id.toString(),
      link,
      ...(input.telegramChatId === undefined
        ? {}
        : { chatId: input.telegramChatId }),
    });

    return { created, link, notification };
  }

  async accept(input: AcceptInvitationInput): Promise<void> {
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

    // The invitee may have verified their own signup after the invitation was
    // created: attach the grant to that account instead of failing to create a
    // duplicate user, and no new password is needed. Acceptance keeps the
    // lower-level grant.assigned event, unlike grantMemberByEmail.
    const existingUser = await this.usersService.findByEmail(link.email);
    if (existingUser) {
      // Atomic insert-only: a stale invitation must not overwrite a newer grant
      // (for example an admin promoted after the link was issued).
      try {
        await this.grantsService.assignRoleIfAbsent({
          userId: existingUser._id.toString(),
          applicationId: link.applicationId.toString(),
          role: link.role,
        });
      } catch (error) {
        await this.release(link._id.toString());
        throw error;
      }
      return;
    }

    try {
      this.validatePassword(input.password, input.passwordConfirmation);
    } catch (error) {
      // A malformed password must not burn the single-use link.
      await this.release(link._id.toString());
      throw error;
    }

    const passwordHash = await this.cryptoService.hashString(input.password);

    let user;
    try {
      // Never copy the invitee-supplied chat id onto the account: an app admin
      // could otherwise redirect every future password-reset link.
      user = await this.usersService.createVerifiedUser({
        email: link.email,
        passwordHash,
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
