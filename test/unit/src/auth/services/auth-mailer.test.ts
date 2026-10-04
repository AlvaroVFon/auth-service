import { AuthMailer } from '../../../../../src/auth/services/auth-mailer';
import { MailerInterface } from '../../../../../src/libs/mailer/mailer.interface';
import { MailTemplate } from '../../../../../src/mail/mail.enum';

describe('AuthMailer', () => {
  test('sendSignupVerificationEmail builds the verification template and link', async () => {
    const sendMailWithTemplate = mock.fn(() => Promise.resolve());
    const mailer = { sendMailWithTemplate } as unknown as MailerInterface;
    const authMailer = new AuthMailer(mailer, 'https://app.test', 'Auth App');

    await authMailer.sendSignupVerificationEmail(
      'jane@example.com',
      'holder-1',
      'ABC123',
    );

    const args = sendMailWithTemplate.mock.calls[0]?.arguments as any[];
    assert.strictEqual(args[0], 'jane@example.com');
    assert.strictEqual(args[1], 'Verify your account');
    assert.strictEqual(args[2], MailTemplate.SIGNUP_VERIFICATION);
    assert.strictEqual(args[3].userName, 'jane@example.com');
    assert.strictEqual(args[3].code, 'ABC123');
    assert.strictEqual(
      args[3].link,
      'https://app.test/verify?holderId=holder-1&code=ABC123',
    );
    assert.strictEqual(args[3].appName, 'Auth App');
  });

  test('sendResetPasswordEmail builds the reset template and link', async () => {
    const sendMailWithTemplate = mock.fn(() => Promise.resolve());
    const mailer = { sendMailWithTemplate } as unknown as MailerInterface;
    const authMailer = new AuthMailer(mailer, 'https://app.test', 'Auth App');

    await authMailer.sendResetPasswordEmail(
      'jane@example.com',
      'user-1',
      'XYZ789',
    );

    const args = sendMailWithTemplate.mock.calls[0]?.arguments as any[];
    assert.strictEqual(args[0], 'jane@example.com');
    assert.strictEqual(args[1], 'Reset your password');
    assert.strictEqual(args[2], MailTemplate.RESET_PASSWORD);
    assert.strictEqual(args[3].username, 'jane@example.com');
    assert.strictEqual(
      args[3].link,
      'https://app.test/reset-password?userId=user-1&code=XYZ789',
    );
    assert.strictEqual(args[3].appName, 'Auth App');
  });
});
