export class BaseError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = 'BASE_ERROR';
    this.statusCode = 500;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class InvalidArgumentError extends BaseError {
  constructor(message: string) {
    super(message);
    this.code = 'INVALID_ARGUMENT';
    this.statusCode = 400;
  }
}

export class EntityAlreadyExistsError extends BaseError {
  constructor(message: string) {
    super(message);
    this.code = 'ENTITY_ALREADY_EXISTS';
    this.statusCode = 409;
  }
}
