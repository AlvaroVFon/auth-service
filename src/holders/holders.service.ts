import { Model } from 'mongoose';

import {
  EMAIL_REGEX,
  OBJECTID_REGEX,
  PASSWORD_REGEX,
} from '../common/constants/regex';
import { normalizeEmail } from '../common/email';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { isDuplicateKeyError } from '../common/mongo/duplicate-key';
import {
  buildPaginatedResult,
  buildSortObject,
  type ListQuery,
  type PaginatedResult,
} from '../common/pagination';
import { CryptoService } from '../libs/crypto';
import { Holder, HolderListItem } from './holders.interface';
import type { HolderSortField, HoldersPort } from './holders.port';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

export class HoldersService implements HoldersPort {
  constructor(
    private readonly holderModel: Model<Holder>,
    private readonly cryptoService: CryptoService,
  ) {}

  async list(
    query: ListQuery<HolderSortField>,
  ): Promise<PaginatedResult<HolderListItem>> {
    const [holders, total] = await Promise.all([
      this.holderModel
        .find()
        .select('email createdAt expiresAt')
        .sort(buildSortObject(query.sort))
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean<
          Array<{
            _id: { toString(): string };
            email: string;
            createdAt?: Date;
            expiresAt: Date;
          }>
        >(),
      this.holderModel.countDocuments(),
    ]);

    return buildPaginatedResult(
      holders.map((holder) => ({
        id: holder._id.toString(),
        email: holder.email,
        ...(holder.createdAt === undefined
          ? {}
          : { createdAt: holder.createdAt }),
        expiresAt: holder.expiresAt,
      })),
      total,
      query,
    );
  }

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
      throw new InvalidArgumentError(INVALID_CREDENTIALS_MESSAGE);
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
        throw new InvalidArgumentError(INVALID_CREDENTIALS_MESSAGE);
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
