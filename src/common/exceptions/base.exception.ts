export class BaseException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class InvalidArgumentError extends BaseException {
  constructor(message: string) {
    super(message);
  }
}

export class EntityAlreadyExistsError extends BaseException {
  constructor(message: string) {
    super(message);
  }
}
