import { BaseError } from './base.exception';

export class InfraError extends BaseError {
  constructor(message: string) {
    super(message);
    this.name = 'InfraError';
    this.code = 'INFRA_ERROR';
    this.statusCode = 500;
  }
}
