import { BaseError } from '../common/exceptions/base.exception';

export class InvalidCredentialsError extends BaseError {
  constructor(message: string) {
    super(message);
  }
}
