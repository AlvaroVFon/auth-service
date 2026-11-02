import {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from '../../../../../src/auth/mfa/recovery-codes';

describe('recovery codes', () => {
  test('should generate ten unique formatted codes', () => {
    const codes = generateRecoveryCodes();

    assert.strictEqual(codes.length, 10);
    assert.strictEqual(new Set(codes).size, 10);

    for (const code of codes) {
      assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    }
  });

  test('should normalize case, dashes and spaces', () => {
    assert.strictEqual(normalizeRecoveryCode(' abcd-ef234 '), 'ABCDEF234');
    assert.strictEqual(
      normalizeRecoveryCode('ABCD-EF234'),
      normalizeRecoveryCode('abcd ef234'),
    );
  });

  test('should hash deterministically without exposing the code', () => {
    const code = 'ABCDE-FGH23';
    const first = hashRecoveryCode(code);

    assert.match(first, /^[a-f0-9]{64}$/);
    assert.strictEqual(first, hashRecoveryCode('abcde fgh23'));
    assert.strictEqual(first.includes('ABCDE'), false);
  });
});
