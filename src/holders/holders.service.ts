import { Model } from 'mongoose';

import {
  EMAIL_REGEX,
  OBJECTID_REGEX,
  PASSWORD_REGEX,
} from '../common/constants/regex';
import { normalizeEmail } from '../common/email';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { isDuplicateKeyError } from '../common/mongo/duplicate-key';
import { CryptoService } from '../libs/crypto';
import { Holder } from './holders.interface';
import type { HoldersPort } from './holders.port';

export class HoldersService implements HoldersPort {
  constructor(
    private readonly holderModel: Model<Holder>,
    private readonly cryptoService: CryptoService,
  ) {}

  async create(email: string, password: string): Promise<Holder> {
    if (!email) {
      throw new InvalidArgumentError('Email is required');
    }

    const normalizedEmail = normalizeEmail(email);

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new InvalidArgumentError('Email format is invalid');
    }
    if (!password) {
      throw new InvalidArgumentError('Password is required');
    }
    if (!PASSWORD_REGEX.test(password)) {
      throw new InvalidArgumentError(
        'Password do not meet complexity requirements',
      );
    }

    const existingHolder = await this.holderModel.findOne({
      email: normalizedEmail,
    });
    if (existingHolder) {
      throw new InvalidArgumentError('Invalid email or password');
    }

    const hashedPassword = await this.cryptoService.hashString(password);

    try {
      return await this.holderModel.create({
        email: normalizedEmail,
        password: hashedPassword,
      });
    } catch (error) {
      // Two concurrent signups can pass the pre-check: the unique index is the
      // final guard, and the loser must see the same anti-enumeration error.
      if (isDuplicateKeyError(error)) {
        throw new InvalidArgumentError('Invalid email or password');
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<Holder | null> {
    if (!email) {
      throw new InvalidArgumentError('Email is required');
    }

    const normalizedEmail = normalizeEmail(email);

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new InvalidArgumentError('Email format is invalid');
    }

    return await this.holderModel.findOne({ email: normalizedEmail });
  }

  async findById(id: string): Promise<Holder | null> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('ID format is invalid');
    }

    const holder = await this.holderModel.findById(id);
    return holder;
  }

  async deleteById(id: string): Promise<void> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('ID format is invalid');
    }

    await this.holderModel.findByIdAndDelete(id);
  }
}
