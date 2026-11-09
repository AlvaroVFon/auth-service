import {
  AUDIT_CSV_COLUMNS,
  auditCsvHeader,
  auditCsvRow,
} from '../../../../src/audit/audit-csv';
import { AuditController } from '../../../../src/audit/audit.controller';
import {
  AuditEvent,
  AuditResult,
  type AuditEventRecord,
} from '../../../../src/audit/audit.interface';
import { InvalidArgumentError } from '../../../../src/common/exceptions/base.exception';

const buildRecord = (): AuditEventRecord => ({
  _id: '507f191e810c19729de860ea' as never,
  event: AuditEvent.LOGIN_SUCCEEDED,
  result: AuditResult.SUCCESS,
  actorId: '507f191e810c19729de860eb' as never,
  targetUserId: '507f191e810c19729de860ec' as never,
  applicationId: '507f191e810c19729de860ed' as never,
  audience: 'app,with-comma',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
});

describe('audit CSV', () => {
  test('exposes the stable column order', () => {
    assert.strictEqual(auditCsvHeader(), AUDIT_CSV_COLUMNS.join(','));
  });

  test('escapes commas and quotes without adding secrets', () => {
    const row = auditCsvRow(buildRecord());

    assert.match(row, /^2026-01-01T00:00:00\.000Z,login\.succeeded,success,/);
    assert.match(row, /"app,with-comma"$/);
    assert.strictEqual(row.includes('token'), false);
    assert.strictEqual(row.includes('password'), false);
  });

  test('neutralizes spreadsheet formula injection', () => {
    const row = auditCsvRow({ ...buildRecord(), audience: '=1+1' });

    assert.match(row, /'=1\+1$/);
  });
});

describe('AuditController.exportCsv', () => {
  const buildController = (total: number) =>
    new AuditController(
      {
        countForExport: async () => total,
        streamForExport: async function* () {
          yield buildRecord();
        },
      } as never,
      1,
    );

  test('rejects an export above the row cap before writing the response', async () => {
    const controller = buildController(2);
    const next = mock.fn();
    const res = {
      status: mock.fn(() => res),
      setHeader: mock.fn(),
      write: mock.fn(),
      end: mock.fn(),
    };

    await (
      controller.exportCsv as unknown as (...args: unknown[]) => Promise<void>
    )({ query: {} }, res, next);

    const error = next.mock.calls[0]?.arguments[0];
    assert.ok(error instanceof InvalidArgumentError);
    assert.match(error.message, /narrow the date range/);
    assert.strictEqual(res.write.mock.callCount(), 0);
  });

  test('never writes more data rows than the cap even if the cursor yields more', async () => {
    const controller = new AuditController(
      {
        countForExport: async () => 1,
        streamForExport: async function* () {
          yield buildRecord();
          yield buildRecord();
        },
      } as never,
      1,
    );
    const next = mock.fn();
    const res = {
      status: mock.fn(() => res),
      setHeader: mock.fn(),
      write: mock.fn(),
      end: mock.fn(),
      headersSent: true,
    };

    await (
      controller.exportCsv as unknown as (...args: unknown[]) => Promise<void>
    )({ query: {} }, res, next);

    assert.strictEqual(res.write.mock.callCount(), 2);
    assert.strictEqual(res.end.mock.callCount(), 1);
  });

  test('streams the header and the rows when the cap is not exceeded', async () => {
    const controller = buildController(1);
    const next = mock.fn();
    const res = {
      status: mock.fn(() => res),
      setHeader: mock.fn(),
      write: mock.fn(),
      end: mock.fn(),
    };

    await (
      controller.exportCsv as unknown as (...args: unknown[]) => Promise<void>
    )({ query: {} }, res, next);

    assert.strictEqual(next.mock.callCount(), 0);
    assert.strictEqual(res.write.mock.callCount(), 2);
    assert.strictEqual(res.end.mock.callCount(), 1);
  });
});
