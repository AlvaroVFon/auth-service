import { MailerInterface as Mailer } from '../libs/mailer/mailer.interface';

export class MailService {
  constructor(private readonly mailer: Mailer) {}

  async sendWelcomeEmail(
    to: string,
    context: Record<string, string>,
  ): Promise<void> {
    await this.mailer.sendWelcomeEmail(to, context);
  }

  async sendVerificationEmail(
    to: string,
    context: Record<string, string>,
  ): Promise<void> {
    await this.mailer.sendSignupVerificationEmail(to, context);
  }
}
