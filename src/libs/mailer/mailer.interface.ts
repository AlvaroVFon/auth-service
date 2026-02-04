export interface MailerInterface {
  sendEmail(to: string, subject: string, body: string): Promise<void>;

  sendMailWithTemplate(
    to: string,
    subject: string,
    templatePath: string,
    context: Record<string, string>,
  ): Promise<void>;

  sendWelcomeEmail(to: string, context: Record<string, string>): Promise<void>;

  sendSignupVerificationEmail(
    to: string,
    context: Record<string, string>,
  ): Promise<void>;
}
