import { Holder } from '../../../src/holders/holders.interface';
import { MotherFactory } from './mother.factory';

export class HolderFactory {
  static generate(overrides?: Partial<Holder>): Holder {
    return {
      _id: MotherFactory.objectId(),
      email: MotherFactory.email(),
      password: MotherFactory.password(),
      expiresAt: MotherFactory.date(),
      ...overrides,
    };
  }
}
