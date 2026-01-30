import { BaseError } from './base.exception';

export class InvalidCredentialsError extends BaseError {
  constructor(message: string) {
    super(message);
    this.code = 'INVALID_CREDENTIALS';
    this.statusCode = 401;
  }
}
