import { BaseError } from './base.exception';

export class InvalidCredentialsError extends BaseError {
  constructor(message: string) {
    super(message);
    this.code = 'INVALID_CREDENTIALS';
    this.statusCode = 401;
  }
}

export class ForbiddenError extends BaseError {
  constructor(message: string) {
    super(message);
    this.code = 'FORBIDDEN';
    this.statusCode = 403;
  }
}
