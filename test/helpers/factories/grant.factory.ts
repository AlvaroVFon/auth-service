import { Grant, GrantRoles } from '../../../src/grants/grants.interface';
import { MotherFactory } from './mother.factory';

export class GrantFactory {
  static generate(overrides?: Partial<Grant>): Grant {
    return {
      _id: MotherFactory.objectId(),
      userId: MotherFactory.objectId(),
      applicationId: MotherFactory.objectId(),
      role: GrantRoles.VIEWER,
      ...overrides,
    };
  }
}
