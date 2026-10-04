import { MailerInterface } from '../../libs/mailer';
import { MailTemplate } from '../../mail/mail.enum';

export class AuthMailer {
  constructor(
    private readonly mailer: MailerInterface,
    private readonly publicAppUrl: string,
    private readonly appName: string,
  ) {}

  async sendSignupVerificationEmail(
    to: string,
    holderId: string,
    code: string,
  ): Promise<void> {
    await this.mailer.sendMailWithTemplate(
      to,
      'Verify your account',
      MailTemplate.SIGNUP_VERIFICATION,
      {
        userName: to,
        code,
        link: `${this.publicAppUrl}/verify?holderId=${holderId}&code=${code}`,
        appName: this.appName,
        year: new Date().getFullYear().toString(),
      },
    );
  }

  async sendResetPasswordEmail(
    to: string,
    userId: string,
    code: string,
  ): Promise<void> {
    await this.mailer.sendMailWithTemplate(
      to,
      'Reset your password',
      MailTemplate.RESET_PASSWORD,
      {
        username: to,
        email: to,
        code,
        link: `${this.publicAppUrl}/reset-password?userId=${userId}&code=${code}`,
        appName: this.appName,
        year: new Date().getFullYear().toString(),
      },
    );
  }
}
