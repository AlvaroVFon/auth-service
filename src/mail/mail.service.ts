import { MailerInterface as Mailer } from '../libs/mailer/mailer.interface';
import { MailTemplate } from './mail.enum';

export class MailService {
  constructor(private readonly mailer: Mailer) {}

  async sendWelcomeEmail(
    to: string,
    context: Record<string, string>,
  ): Promise<void> {
    await this.mailer.sendMailWithTemplate(
      to,
      `Welcome to Our Service`,
      MailTemplate.WELCOME,
      context,
    );
  }

  async sendVerificationEmail(
    to: string,
    context: Record<string, string>,
  ): Promise<void> {
    await this.mailer.sendMailWithTemplate(
      to,
      `Verification Email`,
      MailTemplate.VERIFICATION,
      context,
    );
  }
}
