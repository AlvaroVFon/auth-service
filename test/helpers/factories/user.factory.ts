import { User } from '../../../src/users/users.interface';
import { MotherFactory } from './mother.factory';
import { Roles } from '../../../src/common/enums/roles.enum';

export class UserFactory {
  static generate(overrides?: Partial<User>): User {
    return {
      _id: MotherFactory.objectId(),
      email: MotherFactory.email(),
      password: MotherFactory.string(20),
      role: Roles.USER,
      verified: MotherFactory.boolean(),
      ...overrides,
    };
  }
}
