import { BaseError } from './base.exception';

export class InvalidLinkError extends BaseError {
  constructor(message: string = 'The link is invalid, used or expired') {
    super(message);
    this.name = 'InvalidLinkError';
    this.code = 'INVALID_LINK';
    this.statusCode = 400;
  }
}
