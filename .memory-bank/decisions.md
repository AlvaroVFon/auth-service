# Architecture Decision Records

## ADR-001: Account Lockout Strategy

- **Date:** 2026-06-14
- **Context:** Need to protect against brute-force attacks on the login endpoint. Options include IP-based blocking, CAPTCHA, account lockout, or a combination.
- **Decision:** Implement account-based lockout (not IP-based). After `MAX_LOGIN_ATTEMPTS` consecutive failed logins, the account is locked for `LOCKOUT_DURATION_MS`. Both values are configurable via environment variables. Atomic Mongoose updates (`$inc`, `$set`) are used to prevent race conditions.
- **Consequences:**
  - Legitimate users may be locked out if an attacker knows their email.
  - No IP tracking means distributed attacks are not mitigated (rate limiting handles that separately).
  - Lockout fields (`loginAttempts`, `lockoutUntil`) are stripped from JSON responses for security.
  - Password reset does not clear the lockout counter (can be added later).
