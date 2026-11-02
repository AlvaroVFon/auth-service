import { Roles } from '../common/enums/roles.enum';
import { LoggerInterface } from '../libs/logger';
import type { TelegramPort } from '../libs/telegram';
import type { UsersPort } from '../users';

export type NotificationRecipient = 'invitee' | 'user' | 'owner' | null;

export interface LinkNotificationResult {
  delivered: boolean;
  recipient: NotificationRecipient;
}

export interface NotifyLinkInput {
  linkId: string;
  link: string;
  chatId?: string;
}

export interface LinkNotificationsOptions {
  telegram: TelegramPort | null;
  usersService: UsersPort;
  ownerChatId?: string;
  logger: LoggerInterface;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3000;

export class LinkNotificationsService {
  private readonly telegram: TelegramPort | null;
  private readonly usersService: UsersPort;
  private readonly ownerChatId: string | undefined;
  private readonly logger: LoggerInterface;
  private readonly timeoutMs: number;

  constructor(options: LinkNotificationsOptions) {
    this.telegram = options.telegram;
    this.usersService = options.usersService;
    this.ownerChatId = options.ownerChatId;
    this.logger = options.logger;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async notifyInvitation(
    input: NotifyLinkInput,
  ): Promise<LinkNotificationResult> {
    return this.notify(
      'invitation',
      input,
      (link) =>
        `You have been invited. Open this single-use link to set your password: ${link}`,
      'invitee',
    );
  }

  async notifyPasswordReset(
    input: NotifyLinkInput,
  ): Promise<LinkNotificationResult> {
    return this.notify(
      'password reset',
      input,
      (link) =>
        `A password reset was requested. Open this single-use link to set a new password: ${link}`,
      'user',
    );
  }

  private async notify(
    kind: string,
    input: NotifyLinkInput,
    buildMessage: (link: string) => string,
    chatRecipient: 'invitee' | 'user',
  ): Promise<LinkNotificationResult> {
    if (!this.telegram) {
      this.logger.info(
        `Telegram is disabled; skipped ${kind} link ${input.linkId}`,
      );
      return { delivered: false, recipient: null };
    }

    const target = await this.resolveRecipient(input.chatId, chatRecipient);

    if (!target) {
      this.logger.info(
        `No Telegram recipient for ${kind} link ${input.linkId}; skipped`,
      );
      return { delivered: false, recipient: null };
    }

    try {
      const send = this.telegram.sendMessage(
        target.chatId,
        buildMessage(input.link),
      );
      // If the timeout wins the race, avoid an unhandled rejection from the
      // underlying request.
      send.catch(() => undefined);

      await this.withTimeout(send);
      this.logger.info(
        `Sent ${kind} link ${input.linkId} to ${target.recipient}`,
      );

      return { delivered: true, recipient: target.recipient };
    } catch {
      // Never log the link, the token or the chat id.
      this.logger.warn(
        `Failed to send ${kind} link ${input.linkId} to ${target.recipient}`,
      );
      return { delivered: false, recipient: target.recipient };
    }
  }

  private async resolveRecipient(
    chatId: string | undefined,
    chatRecipient: 'invitee' | 'user',
  ): Promise<{
    chatId: string;
    recipient: Exclude<NotificationRecipient, null>;
  } | null> {
    if (chatId) {
      return { chatId, recipient: chatRecipient };
    }
    if (this.ownerChatId) {
      return { chatId: this.ownerChatId, recipient: 'owner' };
    }

    try {
      const owner = await this.usersService.findByRole(Roles.OWNER);

      if (owner?.telegramChatId) {
        return { chatId: owner.telegramChatId, recipient: 'owner' };
      }
    } catch {
      this.logger.warn('Failed to resolve the owner Telegram chat');
    }

    return null;
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('Telegram notification timed out')),
        this.timeoutMs,
      );
      timer.unref?.();
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
