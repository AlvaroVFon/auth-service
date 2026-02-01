import { BaseError } from '../../common/exceptions/base.exception';

export class InvalidTokenError extends BaseError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTokenError';
    this.code = 'INVALID_TOKEN';
    this.statusCode = 401;
  }
}
