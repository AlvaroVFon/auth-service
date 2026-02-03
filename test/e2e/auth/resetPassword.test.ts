import request from 'supertest';
import { getTestAppInstance } from '../../utils/app';
import { Application } from 'express';
import { DEFAULT_USER_TOKEN } from '../../fixtures/defaults';

describe('Password Reset E2E Tests', () => {
  let app: Application;

  before(async () => {
    app = await getTestAppInstance();
  });
});
