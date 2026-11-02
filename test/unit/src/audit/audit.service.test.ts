import { Model, Types } from 'mongoose';

import {
  AuditEvent,
  AuditEventRecord,
  AuditResult,
} from '../../../../src/audit/audit.interface';
import { createAuditSchema } from '../../../../src/audit/audit.schema';
import { AuditService } from '../../../../src/audit/audit.service';
import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { LoggerInterface } from '../../../../src/libs/logger';

const USER_ID = '507f191e810c19729de860ea';
const APP_ID = '64b64c4f4f4f4f4f4f4f4f4f';

describe('createAuditSchema', () => {
  test('should reject an invalid retention value', () => {
    assert.throws(() => createAuditSchema(0), /AUDIT_RETENTION_DAYS/);
    assert.throws(() => createAuditSchema(Number.NaN), /AUDIT_RETENTION_DAYS/);
  });

  test('should index the documented filters', () => {
    const keys = createAuditSchema(90)
      .indexes()
      .map(([fields]) => Object.keys(fields).join(','));

    assert.ok(keys.includes('event,createdAt'));
    assert.ok(keys.includes('email,createdAt'));
    assert.ok(keys.includes('actorId,createdAt'));
  });
});

describe('AuditService', () => {
  let create: ReturnType<typeof mock.fn>;
  let find: ReturnType<typeof mock.fn>;
  let limit: ReturnType<typeof mock.fn>;
  let sort: ReturnType<typeof mock.fn>;
  let logger: LoggerInterface;
  let service: AuditService;

  beforeEach(() => {
    create = mock.fn(() => Promise.resolve({}));
    limit = mock.fn(() => Promise.resolve([]));
    sort = mock.fn(() => ({ limit }));
    find = mock.fn(() => ({ sort }));
    logger = {
      info: mock.fn(),
      warn: mock.fn(),
      error: mock.fn(),
      debug: mock.fn(),
    };
    service = new AuditService(
      { create, find } as unknown as Model<AuditEventRecord>,
      logger,
    );
  });

  describe('record', () => {
    test('should persist a sanitized event', async () => {
      await service.record({
        event: AuditEvent.LOGIN_SUCCEEDED,
        result: AuditResult.SUCCESS,
        userId: USER_ID,
        email: ' User@Example.com ',
        applicationId: APP_ID,
        audience: 'app-aud',
        role: 'editor',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
      });

      const args = create.mock.calls[0]?.arguments[0] as Record<
        string,
        unknown
      >;
      assert.strictEqual(args.event, AuditEvent.LOGIN_SUCCEEDED);
      assert.strictEqual(args.result, AuditResult.SUCCESS);
      assert.strictEqual(args.email, 'user@example.com');
      assert.strictEqual((args.userId as Types.ObjectId).toString(), USER_ID);
      assert.strictEqual(
        (args.applicationId as Types.ObjectId).toString(),
        APP_ID,
      );
      assert.strictEqual(args.role, 'editor');
      assert.strictEqual('password' in args, false);
      assert.strictEqual('token' in args, false);
    });

    test('should never throw or leak when the write fails', async () => {
      create.mock.mockImplementation(() => Promise.reject(new Error('down')));

      await service.record({
        event: AuditEvent.LOGIN_FAILED,
        result: AuditResult.FAILURE,
        email: 'user@example.com',
      });

      assert.strictEqual(
        (
          logger.warn as unknown as {
            mock: { callCount(): number };
          }
        ).mock.callCount(),
        1,
      );
    });
  });

  describe('list', () => {
    test('should filter by user, app, email, event and date range', async () => {
      const from = new Date('2026-01-01');
      const to = new Date('2026-02-01');

      await service.list({
        userId: USER_ID,
        applicationId: APP_ID,
        email: 'User@Example.com',
        event: AuditEvent.LOGIN_SUCCEEDED,
        from,
        to,
        limit: 10,
      });

      const query = find.mock.calls[0]?.arguments[0] as Record<string, unknown>;
      assert.strictEqual((query.userId as Types.ObjectId).toString(), USER_ID);
      assert.strictEqual(
        (query.applicationId as Types.ObjectId).toString(),
        APP_ID,
      );
      assert.strictEqual(query.email, 'user@example.com');
      assert.strictEqual(query.event, AuditEvent.LOGIN_SUCCEEDED);
      assert.deepStrictEqual(query.createdAt, { $gte: from, $lte: to });
      assert.deepStrictEqual(sort.mock.calls[0]?.arguments[0], {
        createdAt: -1,
      });
      assert.strictEqual(limit.mock.calls[0]?.arguments[0], 10);
    });

    test('should clamp the page size', async () => {
      await service.list({ limit: 9999 });
      assert.strictEqual(limit.mock.calls[0]?.arguments[0], 200);
    });

    test('should reject invalid filters', async () => {
      await assert.rejects(
        service.list({ userId: 'bad-id' }),
        InvalidArgumentError,
      );
      await assert.rejects(
        service.list({ event: 'unknown' as AuditEvent }),
        new InvalidArgumentError('Invalid event'),
      );
      await assert.rejects(
        service.list({
          from: new Date('2026-02-01'),
          to: new Date('2026-01-01'),
        }),
        new InvalidArgumentError('from must be before to'),
      );
    });
  });
});
