import { Application } from 'express';

import type { AuditPort } from '../audit';
import { assertDependencies } from '../common/depencencies-validator';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import { CryptoService, SecretCipher } from '../libs/crypto';
import { LoggerInterface } from '../libs/logger';
import { UsersController } from './users.controller';
import { UsersRouter, type UsersSupportRateLimitConfig } from './users.router';
import { User } from './users.schema';
import { UsersService } from './users.service';

export class UsersModule {
  public readonly service: UsersService;
  public readonly controller: UsersController;

  constructor(
    private readonly cryptoService: CryptoService,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly authorizationMiddleware: AuthorizationMiddleware,
    private readonly logger: LoggerInterface,
    private readonly maxLoginAttempts: number = 5,
    private readonly lockoutDurationMs: number = 900000,
    private readonly mfaCipher: SecretCipher | undefined,
    private readonly auditService: AuditPort,
    private readonly supportRateLimit: UsersSupportRateLimitConfig,
  ) {
    assertDependencies(
      {
        cryptoService,
        authenticationMiddleware,
        authorizationMiddleware,
        logger,
        auditService,
        supportRateLimit,
      },
      this.constructor.name,
    );

    this.service = new UsersService(
      User,
      this.cryptoService,
      this.maxLoginAttempts,
      this.lockoutDurationMs,
      this.mfaCipher,
      this.auditService,
    );
    this.controller = new UsersController(this.service);
  }

  initialize(app: Application): void {
    new UsersRouter(
      this.authenticationMiddleware,
      this.authorizationMiddleware,
      this.controller,
      this.supportRateLimit,
      app,
    );
    this.logger.info('Init Module - Users - OK');
  }
}
