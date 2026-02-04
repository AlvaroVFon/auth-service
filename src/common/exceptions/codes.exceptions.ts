import { BaseError } from './base.exception';

export class AlreadyGeneratedCodeError extends BaseError {
  constructor(message: string) {
    super(message);
    this.name = 'AlreadyGeneratedCodeError';
    this.code = 'ALREADY_GENERATED_CODE';
    this.statusCode = 409;
  }
}

export class InvalidCodeError extends BaseError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCodeError';
    this.code = 'INVALID_CODE';
    this.statusCode = 400;
  }
}
