import { TemplateRenderer } from '../../templates-engine/template-renderer.interface';
import { MailerInterface as Mailer } from '../mailer.interface';
import nodemailer, { Transporter } from 'nodemailer';
import {
  getStringEnvVariable,
  getNumberEnvVariable,
} from '../../../config/env.config';
import { LoggerInterface } from '../../logger/logger.interface';
import { MailTemplate } from '../../../mail/mail.enum';

export class NodeMailerAdapter implements Mailer {
  private readonly transporter: Transporter;
  private readonly smtpHost: string;
  private readonly smtpPort: number;
  private readonly smtpUser: string;
  private readonly smtpPass: string;
  private readonly mailFrom: string;
  private readonly appName: string;
  private readonly year: string;

  constructor(
    private readonly templateRenderer: TemplateRenderer,
    private readonly logger: LoggerInterface,
  ) {
    this.smtpHost = getStringEnvVariable('SMTP_HOST');
    this.smtpPort = getNumberEnvVariable('SMTP_PORT');
    this.smtpUser = getStringEnvVariable('SMTP_USER');
    this.smtpPass = getStringEnvVariable('SMTP_PASS');
    this.mailFrom = getStringEnvVariable(
      'MAIL_FROM',
      'no-reply@auth-service.com',
    );
    this.appName = getStringEnvVariable('APP_NAME', 'Auth Service');
    this.year = new Date().getFullYear().toString();
    this.transporter = this.createTransport();
  }

  createTransport() {
    return nodemailer.createTransport({
      host: this.smtpHost,
      port: this.smtpPort,
      secure: this.smtpPort === 465,
      auth: this.smtpUser
        ? {
            user: this.smtpUser,
            pass: this.smtpPass,
          }
        : undefined,
    });
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.mailFrom,
        to,
        subject,
        html: body,
      });
    } catch (error) {
      this.logger.error(`Error sending email to ${to}: ${error}`);
    }
  }

  async sendMailWithTemplate(
    to: string,
    subject: string,
    templatePath: string,
    context: Record<string, string>,
  ): Promise<void> {
    try {
      const body = this.templateRenderer.render(templatePath, context);
      return await this.sendEmail(to, subject, body);
    } catch (error) {
      this.logger.error(`Error rendering or sending template email: ${error}`);
    }
  }

  async sendWelcomeEmail(
    to: string,
    context: Record<string, string>,
  ): Promise<void> {
    const subject = `Welcome to ${this.appName}`;
    context.appName = this.appName;
    context.year = this.year;

    await this.sendMailWithTemplate(to, subject, MailTemplate.WELCOME, context);
  }

  async sendSignupVerificationEmail(
    to: string,
    context: Record<string, string>,
  ): Promise<void> {
    const subject = `Verify your account`;
    context.appName = this.appName;
    context.year = this.year;

    await this.sendMailWithTemplate(
      to,
      subject,
      MailTemplate.SIGNUP_VERIFICATION,
      context,
    );
  }
}
