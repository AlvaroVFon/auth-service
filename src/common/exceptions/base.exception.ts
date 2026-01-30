export class BaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class InvalidArgumentError extends BaseError {
  constructor(message: string) {
    super(message);
  }
}

export class EntityAlreadyExistsError extends BaseError {
  constructor(message: string) {
    super(message);
  }
}
