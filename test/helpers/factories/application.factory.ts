import { Application } from '../../../src/applications/applications.interface';
import { MotherFactory } from './mother.factory';

export class ApplicationFactory {
  static generate(overrides?: Partial<Application>): Application {
    const suffix = MotherFactory.string(8).toLowerCase();

    return {
      _id: MotherFactory.objectId(),
      name: `Application ${suffix}`,
      slug: `app-${suffix}`,
      audience: `aud-${MotherFactory.string(10).toLowerCase()}`,
      active: true,
      ...overrides,
    };
  }
}
