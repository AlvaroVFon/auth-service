import { faker } from '@faker-js/faker';
import { Types } from 'mongoose';

export class MotherFactory {
  static string(
    length: number = 10,
    casing: 'upper' | 'lower' | 'mixed' = 'lower',
  ): string {
    return faker.string.alphanumeric({ length, casing });
  }

  static number(min: number = 1, max: number = 100): number {
    return faker.number.int({ min, max });
  }

  static boolean(): boolean {
    return faker.datatype.boolean();
  }

  static date(): Date {
    return faker.date.past();
  }

  static email(): string {
    return faker.internet.email().toLowerCase();
  }

  static objectId(): Types.ObjectId {
    return new Types.ObjectId();
  }

  static uuid(): string {
    return faker.string.uuid();
  }

  static password(): string {
    const symbols = '!@#$%^&*()_+{}[]:;<>,.?/~\\-';
    const passwordCharacters = [
      faker.string.alpha({ length: 1, casing: 'lower' }),
      faker.string.alpha({ length: 1, casing: 'upper' }),
      faker.string.numeric(1),
      faker.helpers.arrayElement(symbols.split('')),
      faker.string.alphanumeric({ length: 10 }),
    ];

    return faker.helpers
      .shuffle(passwordCharacters.join('').split(''))
      .join('');
  }
}
