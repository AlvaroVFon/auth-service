import { BaseError } from './base.exception';

export class MfaAlreadyEnabledError extends BaseError {
  constructor() {
    super('MFA is already enabled');
    this.name = 'MfaAlreadyEnabledError';
    this.code = 'MFA_ALREADY_ENABLED';
    this.statusCode = 409;
  }
}

export class MfaNotEnabledError extends BaseError {
  constructor() {
    super('MFA is not enabled');
    this.name = 'MfaNotEnabledError';
    this.code = 'MFA_NOT_ENABLED';
    this.statusCode = 409;
  }
}

export class MfaEnrollmentRequiredError extends BaseError {
  constructor() {
    super('MFA enrollment must be started before activation');
    this.name = 'MfaEnrollmentRequiredError';
    this.code = 'MFA_ENROLLMENT_REQUIRED';
    this.statusCode = 400;
  }
}

export class InvalidMfaCodeError extends BaseError {
  constructor() {
    super('Invalid MFA code');
    this.name = 'InvalidMfaCodeError';
    this.code = 'INVALID_MFA_CODE';
    this.statusCode = 401;
  }
}
