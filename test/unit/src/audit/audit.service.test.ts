import { Model, Types } from 'mongoose';

import {
  AuditEvent,
  AuditEventRecord,
  AuditResult,
} from '../../../../src/audit/audit.interface';
import type { AuditEventFilter } from '../../../../src/audit/audit.port';
import { createAuditSchema } from '../../../../src/audit/audit.schema';
import { AuditService } from '../../../../src/audit/audit.service';
import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';
import { LoggerInterface } from '../../../../src/libs/logger';

const USER_ID = '507f191e810c19729de860ea';
const APP_ID = '64b64c4f4f4f4f4f4f4f4f4f';

const baseFilter = (
  overrides: Partial<AuditEventFilter> = {},
): AuditEventFilter => ({
  page: 1,
  limit: 20,
  sort: { field: 'createdAt', direction: -1 },
  ...overrides,
});

describe('createAuditSchema', () => {
  test('should reject an invalid retention value', () => {
    assert.throws(() => createAuditSchema(0), /AUDIT_RETENTION_DAYS/);
    assert.throws(() => createAuditSchema(Number.NaN), /AUDIT_RETENTION_DAYS/);
  });

  test('should index the documented filters', () => {
    const keys = createAuditSchema(90)
      .indexes()
      .map(([fields]) => Object.keys(fields).join(','));

    assert.ok(keys.includes('event,createdAt,_id'));
    assert.ok(keys.includes('email,createdAt,_id'));
    assert.ok(keys.includes('actorId,createdAt,_id'));
    assert.ok(keys.includes('createdAt,_id'));
  });
});

describe('AuditService', () => {
  let create: ReturnType<typeof mock.fn>;
  let find: ReturnType<typeof mock.fn>;
  let allowDiskUse: ReturnType<typeof mock.fn>;
  let limit: ReturnType<typeof mock.fn>;
  let skip: ReturnType<typeof mock.fn>;
  let sort: ReturnType<typeof mock.fn>;
  let countDocuments: ReturnType<typeof mock.fn>;
  let logger: LoggerInterface;
  let service: AuditService;

  beforeEach(() => {
    create = mock.fn(() => Promise.resolve({}));
    allowDiskUse = mock.fn(() => Promise.resolve([]));
    limit = mock.fn(() => ({ allowDiskUse }));
    skip = mock.fn(() => ({ limit }));
    sort = mock.fn(() => ({ skip }));
    find = mock.fn(() => ({ sort }));
    countDocuments = mock.fn(() => Promise.resolve(0));
    logger = {
      info: mock.fn(),
      warn: mock.fn(),
      error: mock.fn(),
      debug: mock.fn(),
    };
    service = new AuditService(
      { create, find, countDocuments } as unknown as Model<AuditEventRecord>,
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

      await service.list(
        baseFilter({
          userId: USER_ID,
          applicationId: APP_ID,
          email: 'User@Example.com',
          event: AuditEvent.LOGIN_SUCCEEDED,
          from,
          to,
          limit: 10,
        }),
      );

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
        _id: -1,
      });
      assert.strictEqual(skip.mock.calls[0]?.arguments[0], 0);
      assert.strictEqual(limit.mock.calls[0]?.arguments[0], 10);
      assert.strictEqual(allowDiskUse.mock.calls[0]?.arguments[0], true);
      assert.strictEqual(countDocuments.mock.calls[0]?.arguments[0], query);
    });

    test('should search by escaped prefix on email, event and audience', async () => {
      await service.list(baseFilter({ q: 'login.*', page: 2, limit: 5 }));

      const query = find.mock.calls[0]?.arguments[0] as Record<string, unknown>;
      const or = query.$or as Array<Record<string, RegExp>>;
      assert.deepStrictEqual(
        or
          .map((clause) => Object.keys(clause)[0] ?? '')
          .sort((a, b) => a.localeCompare(b)),
        ['audience', 'email', 'event'],
      );
      for (const clause of or) {
        const regex = Object.values(clause)[0]!;
        assert.strictEqual(regex.source, '^login\\.\\*');
        assert.strictEqual(regex.flags.includes('i'), true);
      }
      assert.strictEqual(skip.mock.calls[0]?.arguments[0], 5);
      assert.strictEqual(limit.mock.calls[0]?.arguments[0], 5);
    });

    test('should return the paginated envelope with the total', async () => {
      countDocuments.mock.mockImplementation(() => Promise.resolve(7));

      const result = await service.list(baseFilter({ page: 3, limit: 2 }));

      assert.deepStrictEqual(result, {
        items: [],
        total: 7,
        page: 3,
        limit: 2,
      });
    });

    test('should reject invalid filters', async () => {
      await assert.rejects(
        service.list(baseFilter({ userId: 'bad-id' })),
        InvalidArgumentError,
      );
      await assert.rejects(
        service.list(baseFilter({ event: 'unknown' as AuditEvent })),
        new InvalidArgumentError('Invalid event'),
      );
      await assert.rejects(
        service.list(
          baseFilter({
            from: new Date('2026-02-01'),
            to: new Date('2026-01-01'),
          }),
        ),
        new InvalidArgumentError('from must be before to'),
      );
    });
  });
});
