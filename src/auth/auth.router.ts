import { Application } from 'express';

import type { ApplicationsPort } from '../applications';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import {
  createDynamicRateLimiter,
  createRateLimiter,
} from '../common/middlewares/rate-limiter.middleware';
import type { JwtService } from '../libs/jwt';
import { TokenTypes } from '../libs/jwt';
import type {
  RateLimitPolicy,
  RateLimitRoute,
} from '../settings/settings.port';
import { AuthController } from './controllers/auth.controller';

export interface RateLimitPolicyResolver {
  resolveRateLimitPolicy(
    applicationId: string | undefined,
    route: RateLimitRoute,
  ): Promise<RateLimitPolicy>;
}

export interface AuthRateLimitConfig {
  login: {
    windowMs: number;
    max: number;
  };
  signup: {
    windowMs: number;
    max: number;
  };
  forgotPassword: {
    windowMs: number;
    max: number;
  };
  refresh: {
    windowMs: number;
    max: number;
  };
  mfaVerify: {
    windowMs: number;
    max: number;
  };
  sessionRevoke: {
    windowMs: number;
    max: number;
  };
}

export class AuthRouter {
  constructor(
    private readonly authController: AuthController,
    private readonly app: Application,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly rateLimitConfig: AuthRateLimitConfig,
    private readonly rateLimitPolicy: RateLimitPolicyResolver,
    private readonly applicationsService: ApplicationsPort,
    private readonly jwtService: JwtService,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const loginRateLimiter = createDynamicRateLimiter({
      resolveApplicationId: (request) =>
        this.resolveApplicationFromIdentifier(request.body?.application),
      resolvePolicy: (applicationId) =>
        this.rateLimitPolicy.resolveRateLimitPolicy(applicationId, 'login'),
    });
    const signupRateLimiter = createRateLimiter(
      this.rateLimitConfig.signup.windowMs,
      this.rateLimitConfig.signup.max,
    );
    const forgotPasswordRateLimiter = createRateLimiter(
      this.rateLimitConfig.forgotPassword.windowMs,
      this.rateLimitConfig.forgotPassword.max,
    );
    const refreshRateLimiter = createDynamicRateLimiter({
      resolveApplicationId: (request) =>
        this.resolveApplicationFromRefreshToken(request.body?.refreshToken),
      resolvePolicy: (applicationId) =>
        this.rateLimitPolicy.resolveRateLimitPolicy(applicationId, 'refresh'),
    });
    const mfaVerifyRateLimiter = createDynamicRateLimiter({
      resolveApplicationId: (request) =>
        this.resolveApplicationFromMfaToken(request.body?.mfaToken),
      resolvePolicy: (applicationId) =>
        this.rateLimitPolicy.resolveRateLimitPolicy(applicationId, 'mfa'),
    });

    this.app.post(
      '/auth/login',
      loginRateLimiter,
      this.authController.login.bind(this.authController),
    );

    this.app.post(
      '/auth/signup',
      signupRateLimiter,
      this.authController.signup.bind(this.authController),
    );

    this.app.post(
      '/auth/refresh',
      refreshRateLimiter,
      this.authController.refreshToken.bind(this.authController),
    );

    this.app.post(
      '/auth/verify',
      this.authController.verifyEmail.bind(this.authController),
    );

    this.app.post(
      '/auth/forgot-password',
      forgotPasswordRateLimiter,
      this.authController.forgotPassword.bind(this.authController),
    );

    this.app.post(
      '/auth/reset-password',
      this.authController.resetPassword.bind(this.authController),
    );

    this.app.post(
      '/auth/logout',
      this.authenticationMiddleware.authenticateAny,
      this.authController.logout.bind(this.authController),
    );

    this.app.post(
      '/auth/mfa/verify',
      mfaVerifyRateLimiter,
      this.authController.verifyMfa.bind(this.authController),
    );

    this.app.post(
      '/auth/mfa/enroll',
      loginRateLimiter,
      this.authenticationMiddleware.authenticateAny,
      this.authController.enrollMfa.bind(this.authController),
    );

    this.app.post(
      '/auth/mfa/activate',
      this.authenticationMiddleware.authenticateAny,
      this.authController.activateMfa.bind(this.authController),
    );

    this.app.post(
      '/auth/mfa/disable',
      loginRateLimiter,
      this.authenticationMiddleware.authenticateAny,
      this.authController.disableMfa.bind(this.authController),
    );

    this.app.get(
      '/auth/sessions',
      this.authenticationMiddleware.authenticateAny,
      this.authController.listSessions.bind(this.authController),
    );

    this.app.delete(
      '/auth/sessions/:sessionId',
      this.authenticationMiddleware.authenticateAny,
      this.authController.revokeSession.bind(this.authController),
    );

    this.app.delete(
      '/auth/sessions',
      this.authenticationMiddleware.authenticateAny,
      this.authController.revokeAllSessions.bind(this.authController),
    );

    this.app.get(
      '/auth/me',
      this.authenticationMiddleware.authenticateAny,
      this.authController.me.bind(this.authController),
    );

    this.app.get(
      '/auth/context',
      this.authenticationMiddleware.authenticateAny,
      this.authController.context.bind(this.authController),
    );

    this.app.post(
      '/auth/introspect',
      this.authenticationMiddleware.authenticateAny,
      this.authController.introspect.bind(this.authController),
    );
  }

  /**
   * The login body names the application it targets; only a real application
   * can select a quota, so an arbitrary audience cannot pick a larger one.
   */
  private async resolveApplicationFromIdentifier(
    identifier: unknown,
  ): Promise<string | undefined> {
    if (typeof identifier !== 'string' || identifier.trim() === '') {
      return undefined;
    }

    const application = await this.applicationsService.findBySlugOrAudience(
      identifier.trim(),
    );

    return application?._id.toString();
  }

  /**
   * The refresh token is verified before trusting its audience, so a forged
   * `aud` cannot move the request to another application's budget.
   */
  private async resolveApplicationFromRefreshToken(
    token: unknown,
  ): Promise<string | undefined> {
    if (typeof token !== 'string' || token === '') {
      return undefined;
    }

    try {
      const claims = this.jwtService.verifyToken(token);
      if (claims.type !== TokenTypes.REFRESH || claims.aud === undefined) {
        return undefined;
      }

      const application = await this.applicationsService.findByAudience(
        claims.aud,
      );

      return application?._id.toString();
    } catch {
      return undefined;
    }
  }

  /** The MFA challenge is verified before trusting the application it names. */
  private async resolveApplicationFromMfaToken(
    token: unknown,
  ): Promise<string | undefined> {
    if (typeof token !== 'string' || token === '') {
      return undefined;
    }

    try {
      const claims = this.jwtService.verifyMfaChallenge(token);
      if (claims.app === undefined) {
        return undefined;
      }

      const application = await this.applicationsService.findBySlug(claims.app);

      return application?._id.toString();
    } catch {
      return undefined;
    }
  }
}
