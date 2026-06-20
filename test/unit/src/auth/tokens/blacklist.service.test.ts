import { BlacklistService } from '../../../../../src/auth/tokens/blacklist.service';
import { BlacklistedToken } from '../../../../../src/auth/tokens/blacklisted-token.interface';
import { BlacklistedTokenModel } from '../../../../../src/auth/tokens/blacklisted-token.schema';
import fixture from '../../../../fixtures';

describe('BlacklistService', () => {
  let blacklistService: BlacklistService;

  before(() => {
    blacklistService = new BlacklistService(BlacklistedTokenModel);
  });

  describe('blacklist', () => {
    test('should upsert a blacklist entry', async () => {
      const jti = 'test-blacklist-upsert-001';
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

      await blacklistService.blacklist(jti, expiresAt);

      const entry = await fixture.findOne<BlacklistedToken>(
        BlacklistedTokenModel.modelName,
        { jti },
      );
      assert.ok(entry);
      assert.strictEqual(entry?.jti, jti);
      assert.strictEqual(entry?.expiresAt.getTime(), expiresAt.getTime());
    });

    test('should be idempotent on re-blacklist', async () => {
      const jti = 'test-blacklist-idempotent-001';
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

      await blacklistService.blacklist(jti, expiresAt);
      await blacklistService.blacklist(jti, expiresAt);

      const entries = await fixture.find<BlacklistedToken>(
        BlacklistedTokenModel.modelName,
        { jti },
      );
      assert.strictEqual(entries.length, 1);
    });
  });

  describe('isBlacklisted', () => {
    test('should return true for a blacklisted jti', async () => {
      const jti = 'test-blacklist-check-001';
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

      await blacklistService.blacklist(jti, expiresAt);

      const result = await blacklistService.isBlacklisted(jti);
      assert.strictEqual(result, true);
    });

    test('should return false for a non-blacklisted jti', async () => {
      const result = await blacklistService.isBlacklisted(
        'test-blacklist-check-999',
      );
      assert.strictEqual(result, false);
    });
  });
});
