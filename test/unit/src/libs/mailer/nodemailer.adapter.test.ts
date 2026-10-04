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

const withEnvAsync = async <T>(
  key: string,
  value: string,
  run: () => Promise<T>,
): Promise<T> => {
  const original = process.env[key];
  process.env[key] = value;
  try {
    return await run();
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
      withEnv('SMTP_HOST', 'smtp.example.com', () => {
        withEnv('SMTP_PORT', '2525', () => {
          withEnv('SMTP_USER', 'api-user', () => {
            withEnv('SMTP_PASS', 'api-pass', () => {
              const local = new NodeMailerAdapter(
                renderer as any,
                logger as any,
              );
              const options = (local.createTransport() as any).options;

              assert.strictEqual(options.host, 'smtp.example.com');
              assert.strictEqual(options.port, 2525);
              assert.strictEqual(options.secure, false);
              assert.deepStrictEqual(options.auth, {
                user: 'api-user',
                pass: 'api-pass',
              });
            });
          });
        });
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
      await withEnvAsync('MAIL_FROM', 'sender@example.com', async () => {
        const local = new NodeMailerAdapter(renderer as any, logger as any);
        const transporter = (local as any).transporter;
        const sendMail = mock.method(transporter, 'sendMail', async () => ({
          messageId: '1',
        }));

        await local.sendEmail('to@example.com', 'Subject', '<b>hello</b>');

        assert.strictEqual(sendMail.mock.callCount(), 1);
        assert.deepStrictEqual(sendMail.mock.calls[0]?.arguments[0], {
          from: 'sender@example.com',
          to: 'to@example.com',
          subject: 'Subject',
          html: '<b>hello</b>',
        });
      });
    });

    test('should log and propagate transporter failures', async () => {
      const transporter = (adapter as any).transporter;
      mock.method(transporter, 'sendMail', async () => {
        throw new Error('smtp down');
      });

      await assert.rejects(
        adapter.sendEmail('to@example.com', 'Subject', '<b>hello</b>'),
        new Error('smtp down'),
      );

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

    test('should log and propagate render failures', async () => {
      renderer.render.mock.mockImplementation(() => {
        throw new Error('missing template');
      });

      await assert.rejects(
        adapter.sendMailWithTemplate('to@example.com', 'Subject', 'bad', {}),
        new Error('missing template'),
      );

      assert.strictEqual(logger.error.mock.callCount(), 1);
      assert.match(
        String(logger.error.mock.calls[0]?.arguments[0]),
        /Error rendering or sending template email/,
      );
    });
  });
});
