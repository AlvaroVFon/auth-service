import { NodeMailerAdapter } from '../../../../../src/libs/mailer/adapters/nodemailer.adapter';
import { MailTemplate } from '../../../../../src/mail/mail.enum';

const createRenderer = () => ({
  render: mock.fn(() => '<html>rendered</html>'),
});

const createLogger = () => ({
  info: mock.fn(),
  error: mock.fn(),
  warn: mock.fn(),
  debug: mock.fn(),
});

const withEnv = (key: string, value: string, run: () => void) => {
  const original = process.env[key];
  process.env[key] = value;
  try {
    run();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
};

describe('NodeMailerAdapter', () => {
  let renderer: ReturnType<typeof createRenderer>;
  let logger: ReturnType<typeof createLogger>;
  let adapter: NodeMailerAdapter;

  beforeEach(() => {
    renderer = createRenderer();
    logger = createLogger();
    adapter = new NodeMailerAdapter(renderer as any, logger as any);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe('createTransport()', () => {
    test('should map SMTP env vars to transport options', () => {
      const options = (adapter.createTransport() as any).options;

      assert.strictEqual(options.host, 'localhost');
      assert.strictEqual(options.port, 1025);
      assert.strictEqual(options.secure, false);
      assert.deepStrictEqual(options.auth, {
        user: 'your_smtp_user',
        pass: 'your_smtp_password',
      });
    });

    test('should mark the transport secure when the port is 465', () => {
      withEnv('SMTP_PORT', '465', () => {
        const local = new NodeMailerAdapter(renderer as any, logger as any);
        const options = (local.createTransport() as any).options;

        assert.strictEqual(options.port, 465);
        assert.strictEqual(options.secure, true);
      });
    });

    test('should omit auth when there is no SMTP user', () => {
      withEnv('SMTP_USER', '', () => {
        const local = new NodeMailerAdapter(renderer as any, logger as any);

        assert.strictEqual(
          (local.createTransport() as any).options.auth,
          undefined,
        );
      });
    });
  });

  describe('sendEmail()', () => {
    test('should send the message with the configured from address', async () => {
      const transporter = (adapter as any).transporter;
      const sendMail = mock.method(transporter, 'sendMail', async () => ({
        messageId: '1',
      }));

      await adapter.sendEmail('to@example.com', 'Subject', '<b>hello</b>');

      assert.strictEqual(sendMail.mock.callCount(), 1);
      assert.deepStrictEqual(sendMail.mock.calls[0]?.arguments[0], {
        from: 'no-reply@auth-service.com',
        to: 'to@example.com',
        subject: 'Subject',
        html: '<b>hello</b>',
      });
    });

    test('should log and swallow transporter failures', async () => {
      const transporter = (adapter as any).transporter;
      mock.method(transporter, 'sendMail', async () => {
        throw new Error('smtp down');
      });

      await adapter.sendEmail('to@example.com', 'Subject', '<b>hello</b>');

      assert.strictEqual(logger.error.mock.callCount(), 1);
      assert.match(
        String(logger.error.mock.calls[0]?.arguments[0]),
        /Error sending email to to@example\.com/,
      );
    });
  });

  describe('sendMailWithTemplate()', () => {
    test('should render the template then send the rendered body', async () => {
      const sendEmail = mock.method(adapter, 'sendEmail', async () => {});

      await adapter.sendMailWithTemplate(
        'to@example.com',
        'Subject',
        MailTemplate.WELCOME,
        { a: '1' },
      );

      assert.deepStrictEqual(renderer.render.mock.calls[0]?.arguments, [
        MailTemplate.WELCOME,
        { a: '1' },
      ]);
      assert.deepStrictEqual(sendEmail.mock.calls[0]?.arguments, [
        'to@example.com',
        'Subject',
        '<html>rendered</html>',
      ]);
    });

    test('should log and swallow render failures', async () => {
      renderer.render.mock.mockImplementation(() => {
        throw new Error('missing template');
      });

      await adapter.sendMailWithTemplate(
        'to@example.com',
        'Subject',
        'bad',
        {},
      );

      assert.strictEqual(logger.error.mock.callCount(), 1);
      assert.match(
        String(logger.error.mock.calls[0]?.arguments[0]),
        /Error rendering or sending template email/,
      );
    });
  });

  describe('email builders', () => {
    test('sendWelcomeEmail should use the welcome subject/template and inject appName+year', async () => {
      const send = mock.method(adapter, 'sendMailWithTemplate', async () => {});
      const context: Record<string, string> = { userName: 'jane' };

      await adapter.sendWelcomeEmail('jane@example.com', context);

      const args = send.mock.calls[0]?.arguments as any[];
      assert.strictEqual(args[0], 'jane@example.com');
      assert.strictEqual(args[1], 'Welcome to Auth Service');
      assert.strictEqual(args[2], MailTemplate.WELCOME);
      assert.strictEqual(args[3], context);
      assert.strictEqual(context.appName, 'Auth Service');
      assert.strictEqual(context.year, new Date().getFullYear().toString());
    });

    test('sendSignupVerificationEmail should use the verification subject/template', async () => {
      const send = mock.method(adapter, 'sendMailWithTemplate', async () => {});
      const context: Record<string, string> = { code: '123456' };

      await adapter.sendSignupVerificationEmail('jane@example.com', context);

      const args = send.mock.calls[0]?.arguments as any[];
      assert.strictEqual(args[1], 'Verify your account');
      assert.strictEqual(args[2], MailTemplate.SIGNUP_VERIFICATION);
      assert.strictEqual(context.appName, 'Auth Service');
      assert.strictEqual(context.year, new Date().getFullYear().toString());
    });

    test('sendResetPasswordEmail should use the reset subject/template', async () => {
      const send = mock.method(adapter, 'sendMailWithTemplate', async () => {});
      const context: Record<string, string> = { email: 'jane@example.com' };

      await adapter.sendResetPasswordEmail('jane@example.com', context);

      const args = send.mock.calls[0]?.arguments as any[];
      assert.strictEqual(args[1], 'Reset your password');
      assert.strictEqual(args[2], MailTemplate.RESET_PASSWORD);
      assert.strictEqual(context.appName, 'Auth Service');
      assert.strictEqual(context.year, new Date().getFullYear().toString());
    });
  });
});
