import { CryptoService } from '../../../../src/libs/crypto/crypto.service';

describe('Crypto Service', () => {
  let cryptoService: CryptoService;

  beforeEach(() => {
    cryptoService = new CryptoService();
  });

  describe('hashString()', () => {
    test('should hash a password correctly', async () => {
      const password = 'mySecurePassword';
      const hashedPassword = await cryptoService.hashString(password);
      assert.notEqual(hashedPassword, password);
      assert.match(hashedPassword, /^\$2[ayb]\$.{56}$/);
    });

    test('should produce different hashes for the same password with different salt rounds', async () => {
      const password = 'mySecurePassword';
      const hash1 = await cryptoService.hashString(password, 8);
      const hash2 = await cryptoService.hashString(password, 12);
      assert.notEqual(hash1, hash2);
    });

    test('should produce different hashes for the same password with the same salt rounds', async () => {
      const password = 'mySecurePassword';
      const hash1 = await cryptoService.hashString(password, 10);
      const hash2 = await cryptoService.hashString(password, 10);
      assert.notEqual(hash1, hash2);
    });
  });

  describe('compareString()', () => {
    test('should return true for matching password and hash', async () => {
      const password = 'mySecurePassword';
      const hashedPassword = await cryptoService.hashString(password);
      const isMatch = await cryptoService.compareString(password, hashedPassword);
      assert.ok(isMatch);
    });

    test('should return false for non-matching password and hash', async () => {
      const password = 'mySecurePassword';
      const wrongPassword = 'wrongPassword';
      const hashedPassword = await cryptoService.hashString(password);
      const isMatch = await cryptoService.compareString(wrongPassword, hashedPassword);
      assert.ok(!isMatch);
    });
  });
});
