import express, { type Application } from 'express';
import request from 'supertest';

import { createDynamicRateLimiter } from '../../../../src/common/middlewares/rate-limiter.middleware';

interface Policy {
  windowMs: number;
  max: number;
}

const buildApp = (options: {
  resolveApplicationId: (
    request: express.Request,
  ) => Promise<string | undefined>;
  resolvePolicy: (applicationId: string | undefined) => Promise<Policy>;
}): Application => {
  const app = express();
  app.use(express.json());
  app.post('/login', createDynamicRateLimiter(options), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({ error: error.message });
    },
  );

  return app;
};

describe('createDynamicRateLimiter', () => {
  test('applies the policy resolved per request and isolates applications', async () => {
    const policies: Record<string, Policy> = {
      a: { windowMs: 60_000, max: 2 },
      b: { windowMs: 60_000, max: 5 },
    };
    const app = buildApp({
      resolveApplicationId: async (req) =>
        typeof req.body?.application === 'string'
          ? req.body.application
          : undefined,
      resolvePolicy: async (applicationId) =>
        policies[applicationId ?? 'a'] ?? policies.a!,
    });

    await request(app).post('/login').send({ application: 'a' }).expect(200);
    await request(app).post('/login').send({ application: 'a' }).expect(200);
    const limited = await request(app)
      .post('/login')
      .send({ application: 'a' })
      .expect(429);
    assert.ok(limited.body.error);

    // The second application keeps its own budget.
    await request(app).post('/login').send({ application: 'b' }).expect(200);
  });

  test('applies a policy change without rebuilding the middleware', async () => {
    const policy: Policy = { windowMs: 60_000, max: 3 };
    const app = buildApp({
      resolveApplicationId: async () => 'a',
      resolvePolicy: async () => policy,
    });

    await request(app).post('/login').send({}).expect(200);
    await request(app).post('/login').send({}).expect(200);

    policy.max = 1;
    // A new policy signature starts a fresh limiter instance.
    await request(app).post('/login').send({}).expect(200);
    await request(app).post('/login').send({}).expect(429);
  });

  test('forwards resolver failures to the error handler', async () => {
    const app = buildApp({
      resolveApplicationId: async () => {
        throw new Error('settings unavailable');
      },
      resolvePolicy: async () => ({ windowMs: 60_000, max: 5 }),
    });

    const response = await request(app).post('/login').send({}).expect(500);

    assert.strictEqual(response.body.error, 'settings unavailable');
  });

  test('uses the global bucket when no application is resolved', async () => {
    const app = buildApp({
      resolveApplicationId: async () => undefined,
      resolvePolicy: async () => ({ windowMs: 60_000, max: 1 }),
    });

    await request(app).post('/login').send({}).expect(200);
    await request(app).post('/login').send({}).expect(429);
  });
});
