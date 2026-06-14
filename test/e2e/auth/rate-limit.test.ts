import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import { Application } from 'express';
import { generateRandomEmail } from '../../fixtures/defaults';

// Per-route rate limit values, read from .env.test
// Defaults match the production defaults from the spec
const LOGIN_MAX = parseInt(process.env.RATE_LIMIT_LOGIN_MAX ?? '5', 10);
const SIGNUP_MAX = parseInt(process.env.RATE_LIMIT_SIGNUP_MAX ?? '3', 10);
const FORGOT_PASSWORD_MAX = parseInt(
  process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX ?? '3',
  10,
);

const RATE_LIMIT_MESSAGE = 'Too many requests, please try again later.';

/**
 * Asserts that the response includes standard rate limit headers.
 * Supports both draft-6 (`RateLimit-*`) and legacy (`X-RateLimit-*`) formats.
 */
const assertRateLimitHeadersPresent = (
  headers: Record<string, string | string[] | undefined>,
): void => {
  const hasDraft6 = headers['ratelimit-limit'] !== undefined;
  const hasLegacy = headers['x-ratelimit-limit'] !== undefined;
  assert.ok(
    hasDraft6 || hasLegacy,
    'Response should include rate limit headers (RateLimit-Limit or X-RateLimit-Limit)',
  );
};

describe('E2E Auth Rate Limiting', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });

  // NOTE on test ordering: the test app is cached at module level, so the
  // in-memory rate limiter state persists across tests in this file.
  // Tests are ordered to avoid order-dependent flakiness:
  //   1. "Under limit" assertions run first (counters at 0)
  //   2. Login is exhausted before signup/forgot-password to test independence
  //   3. Each per-route 429 test makes `MAX` requests in a loop then asserts
  //      the next request is 429, which is robust to prior counter state
  //   4. Global limiter test uses a non-per-route endpoint

  // ---- Requirement: endpoint works normally under its rate limit ----
  test('POST /auth/login works normally when under its rate limit', async () => {
    const response = await request(app).post('/auth/login').send({
      email: 'normal-under-limit@example.com',
      password: 'WrongPassword123!',
    });

    // Should be 401 (invalid credentials), not 429
    assert.notStrictEqual(
      response.status,
      429,
      'Login should not be rate limited when under the limit',
    );
  });

  // ---- Requirement: rate limit headers present in responses ----
  test('rate limit headers are present in responses from rate-limited endpoints', async () => {
    const response = await request(app).post('/auth/login').send({
      email: 'headers-check@example.com',
      password: 'WrongPassword123!',
    });

    assertRateLimitHeadersPresent(response.headers);
  });

  // ---- Requirement: POST /auth/login returns 429 after exceeding its limit ----
  test('POST /auth/login returns 429 after exceeding its rate limit', async () => {
    const payload = {
      email: 'login-rate-limit@example.com',
      password: 'WrongPassword123!',
    };

    // Exhaust the limit (prior tests may have already used some quota)
    for (let i = 0; i < LOGIN_MAX; i++) {
      await request(app).post('/auth/login').send(payload);
    }

    // The next request should be rate-limited
    const response = await request(app)
      .post('/auth/login')
      .send(payload)
      .expect(429);

    assert.strictEqual(response.body.error, RATE_LIMIT_MESSAGE);
    // Retry-After header should be present on 429
    assert.ok(
      response.headers['retry-after'] !== undefined,
      '429 response should include Retry-After header',
    );
  });

  // ---- Requirement: per-route limiters are independent ----
  // Runs AFTER login is exhausted (above) and BEFORE signup/forgot-password
  // are exhausted (below), so signup and forgot-password limiters are still fresh.
  test('per-route rate limiters are independent', async () => {
    // At this point, login has been rate-limited by the previous test.
    // Verify that signup and forgot-password are NOT rate-limited
    // (they have independent counters).

    const signupPayload = {
      email: generateRandomEmail('indep-signup'),
      password: 'StrongPassword123!',
      passwordConfirmation: 'StrongPassword123!',
    };
    const signupResponse = await request(app)
      .post('/auth/signup')
      .send(signupPayload);
    assert.notStrictEqual(
      signupResponse.status,
      429,
      'Signup should not be affected by login rate limit',
    );

    const forgotResponse = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'indep-forgot@example.com' });
    assert.notStrictEqual(
      forgotResponse.status,
      429,
      'Forgot-password should not be affected by login rate limit',
    );
  });

  // ---- Requirement: POST /auth/signup returns 429 after exceeding its limit ----
  test('POST /auth/signup returns 429 after exceeding its rate limit', async () => {
    // Use unique emails for each request to avoid "email already in use" errors
    for (let i = 0; i < SIGNUP_MAX; i++) {
      await request(app)
        .post('/auth/signup')
        .send({
          email: `signup-rate-limit-${i}@example.com`,
          password: 'StrongPassword123!',
          passwordConfirmation: 'StrongPassword123!',
        });
    }

    const response = await request(app)
      .post('/auth/signup')
      .send({
        email: 'signup-rate-limit-final@example.com',
        password: 'StrongPassword123!',
        passwordConfirmation: 'StrongPassword123!',
      })
      .expect(429);

    assert.strictEqual(response.body.error, RATE_LIMIT_MESSAGE);
  });

  // ---- Requirement: POST /auth/forgot-password returns 429 after exceeding its limit ----
  test('POST /auth/forgot-password returns 429 after exceeding its rate limit', async () => {
    const payload = { email: 'forgot-rate-limit@example.com' };

    for (let i = 0; i < FORGOT_PASSWORD_MAX; i++) {
      await request(app).post('/auth/forgot-password').send(payload);
    }

    const response = await request(app)
      .post('/auth/forgot-password')
      .send(payload)
      .expect(429);

    assert.strictEqual(response.body.error, RATE_LIMIT_MESSAGE);
  });

  // ---- Requirement: global rate limiter still applies to non-auth routes ----
  test('global rate limiter still applies to non-auth routes', async () => {
    // Use /auth/verify which is NOT in the per-route list.
    // Only the global rate limiter (100 req/15min) applies to this route.
    // /auth/verify is also not behind authentication, so the request will
    // simply fail validation, but rate limit headers should still be present.
    const response = await request(app).post('/auth/verify').send({});

    // Should not be 429 (we're well under 100 requests in the test suite)
    assert.notStrictEqual(
      response.status,
      429,
      'Non-auth route should not be rate limited under normal load',
    );
    // Global rate limit headers should be present
    assertRateLimitHeadersPresent(response.headers);
  });
});
