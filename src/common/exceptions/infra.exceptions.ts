import { BaseError } from './base.exception';

export class InfraError extends BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InfraError';
    this.code = 'INFRA_ERROR';
    this.statusCode = 500;
  }
}
