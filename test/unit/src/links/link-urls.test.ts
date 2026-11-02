import {
  buildInvitationLink,
  buildPasswordResetLink,
} from '../../../../src/links/link-urls';

describe('link urls', () => {
  test('should build the invitation link', () => {
    assert.strictEqual(
      buildInvitationLink('https://auth.example.com', 'abc-123'),
      'https://auth.example.com/invitations/accept?token=abc-123',
    );
  });

  test('should build the password reset link', () => {
    assert.strictEqual(
      buildPasswordResetLink('https://auth.example.com', 'abc-123'),
      'https://auth.example.com/reset-password?token=abc-123',
    );
  });

  test('should normalize trailing slashes', () => {
    assert.strictEqual(
      buildInvitationLink('https://auth.example.com///', 'token'),
      'https://auth.example.com/invitations/accept?token=token',
    );
  });

  test('should URL-encode the token', () => {
    assert.strictEqual(
      buildPasswordResetLink('https://auth.example.com', 'a b+c/d'),
      'https://auth.example.com/reset-password?token=a%20b%2Bc%2Fd',
    );
  });
});
