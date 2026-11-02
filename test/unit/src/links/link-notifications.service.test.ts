import { Roles } from '../../../../src/common/enums/roles.enum';
import { LoggerInterface } from '../../../../src/libs/logger';
import { TelegramPort } from '../../../../src/libs/telegram';
import { LinkNotificationsService } from '../../../../src/links/link-notifications.service';
import { UsersPort } from '../../../../src/users';

const LINK = 'https://app.test/invitations/accept?token=super-secret-token';
const LINK_ID = '64b64c4f4f4f4f4f4f4f4f4f';

describe('LinkNotificationsService', () => {
  let sendMessage: ReturnType<typeof mock.fn>;
  let findByRole: ReturnType<typeof mock.fn>;
  let logger: LoggerInterface;

  const build = (ownerChatId?: string) =>
    new LinkNotificationsService({
      telegram: { sendMessage } as unknown as TelegramPort,
      usersService: { findByRole } as unknown as UsersPort,
      ...(ownerChatId === undefined ? {} : { ownerChatId }),
      logger,
      timeoutMs: 20,
    });

  beforeEach(() => {
    sendMessage = mock.fn(() => Promise.resolve());
    findByRole = mock.fn(() => Promise.resolve(null));
    logger = {
      info: mock.fn(),
      warn: mock.fn(),
      error: mock.fn(),
      debug: mock.fn(),
    };
  });

  test('should send an invitation to the invitee chat', async () => {
    const result = await build().notifyInvitation({
      linkId: LINK_ID,
      link: LINK,
      chatId: '4242',
    });

    assert.deepStrictEqual(result, {
      delivered: true,
      recipient: 'invitee',
    });
    assert.deepStrictEqual(sendMessage.mock.calls[0]?.arguments, [
      '4242',
      `You have been invited. Open this single-use link to set your password: ${LINK}`,
    ]);
  });

  test('should fall back to the configured owner chat', async () => {
    const result = await build('999').notifyInvitation({
      linkId: LINK_ID,
      link: LINK,
    });

    assert.deepStrictEqual(result, { delivered: true, recipient: 'owner' });
    assert.strictEqual(sendMessage.mock.calls[0]?.arguments[0], '999');
  });

  test('should fall back to the owner user chat', async () => {
    findByRole.mock.mockImplementation(async () => ({
      telegramChatId: '777',
    }));

    const result = await build().notifyPasswordReset({
      linkId: LINK_ID,
      link: LINK,
    });

    assert.deepStrictEqual(result, { delivered: true, recipient: 'owner' });
    assert.strictEqual(sendMessage.mock.calls[0]?.arguments[0], '777');
    assert.deepStrictEqual(findByRole.mock.calls[0]?.arguments, [Roles.OWNER]);
  });

  test('should skip when there is no recipient', async () => {
    const result = await build().notifyInvitation({
      linkId: LINK_ID,
      link: LINK,
    });

    assert.deepStrictEqual(result, {
      delivered: false,
      recipient: null,
    });
    assert.strictEqual(sendMessage.mock.callCount(), 0);
  });

  test('should never throw when delivery fails', async () => {
    sendMessage.mock.mockImplementation(() =>
      Promise.reject(new Error('bot down')),
    );

    const result = await build('999').notifyInvitation({
      linkId: LINK_ID,
      link: LINK,
    });

    assert.deepStrictEqual(result, {
      delivered: false,
      recipient: 'owner',
    });
  });

  test('should bound a hanging delivery', async () => {
    sendMessage.mock.mockImplementation(() => new Promise(() => {}));

    const result = await build('999').notifyInvitation({
      linkId: LINK_ID,
      link: LINK,
    });

    assert.deepStrictEqual(result, {
      delivered: false,
      recipient: 'owner',
    });
  });

  test('should never log the link, token or chat id', async () => {
    sendMessage.mock.mockImplementation(() =>
      Promise.reject(new Error('bot down')),
    );

    await build('999').notifyInvitation({
      linkId: LINK_ID,
      link: LINK,
      chatId: '4242',
    });

    const calls = [
      ...(logger.info as unknown as { mock: { calls: unknown[] } }).mock.calls,
      ...(logger.warn as unknown as { mock: { calls: unknown[] } }).mock.calls,
    ];
    const serialized = JSON.stringify(calls);

    assert.strictEqual(serialized.includes('super-secret-token'), false);
    assert.strictEqual(serialized.includes('token='), false);
    assert.strictEqual(serialized.includes('4242'), false);
    assert.strictEqual(serialized.includes('999'), false);
  });
});
