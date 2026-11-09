import { AuditEvent, AuditResult } from '../../../../src/audit/audit.interface';
import { createAuditEventModel } from '../../../../src/audit/audit.schema';
import { AuditService } from '../../../../src/audit/audit.service';
import type { LoggerInterface } from '../../../../src/libs/logger';

const AuditModel = createAuditEventModel();

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as LoggerInterface;

describe('AuditService.countLogins', () => {
  const service = new AuditService(AuditModel, logger);

  const seed = (event: AuditEvent, result: AuditResult, createdAt: Date) =>
    AuditModel.collection.insertOne({
      event,
      result,
      createdAt,
      updatedAt: createdAt,
    });

  test('counts only login events inside each window and splits outcomes', async () => {
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;

    await seed(
      AuditEvent.LOGIN_SUCCEEDED,
      AuditResult.SUCCESS,
      new Date(now - hour),
    );
    await seed(
      AuditEvent.LOGIN_FAILED,
      AuditResult.FAILURE,
      new Date(now - 2 * hour),
    );
    await seed(
      AuditEvent.ACCOUNT_LOCKED,
      AuditResult.FAILURE,
      new Date(now - 3 * hour),
    );
    await seed(
      AuditEvent.LOGIN_FAILED,
      AuditResult.FAILURE,
      new Date(now - 2 * day),
    );
    await seed(
      AuditEvent.LOGIN_SUCCEEDED,
      AuditResult.SUCCESS,
      new Date(now - 8 * day),
    );
    // Another event type inside the window must never be counted.
    await seed(
      AuditEvent.TOKEN_REFRESHED,
      AuditResult.SUCCESS,
      new Date(now - hour),
    );

    assert.deepStrictEqual(await service.countLogins(new Date(now - day)), {
      succeeded: 1,
      failed: 2,
    });
    assert.deepStrictEqual(await service.countLogins(new Date(now - 7 * day)), {
      succeeded: 1,
      failed: 3,
    });
  });

  test('returns zeros when the window has no login events', async () => {
    assert.deepStrictEqual(
      await service.countLogins(new Date(Date.now() + 60_000)),
      { succeeded: 0, failed: 0 },
    );
  });
});
