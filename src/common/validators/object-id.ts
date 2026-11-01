import { OBJECTID_REGEX } from '../constants/regex';
import { InvalidArgumentError } from '../exceptions/base.exception';

export const assertObjectId = (value: string, name: string = 'ID'): void => {
  if (!value) {
    throw new InvalidArgumentError(`${name} is required`);
  }
  if (!OBJECTID_REGEX.test(value)) {
    throw new InvalidArgumentError(`${name} format is invalid`);
  }
};
