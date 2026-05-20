import { Code, CodeType } from '../../../src/auth/codes/code.interface';
import { MotherFactory } from './mother.factory';

export class CodesFactory {
  static generate(overrides?: Partial<Code>): Code {
    return {
      _id: MotherFactory.objectId(),
      code: MotherFactory.string(6),
      expiresAt: MotherFactory.date(),
      holderId: MotherFactory.objectId(),
      type: CodeType.SIGNUP,
      used: MotherFactory.boolean(),
      ...overrides,
    };
  }
}
