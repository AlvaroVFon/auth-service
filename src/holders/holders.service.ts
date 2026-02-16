import { Model } from 'mongoose';
import { Holder } from './holders.interface';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import {
  EMAIL_REGEX,
  OBJECTID_REGEX,
  PASSWORD_REGEX,
} from '../common/constants/regex';
import { CryptoService } from '../libs/crypto/crypto.service';

export class HoldersService {
  constructor(
    private readonly holderModel: Model<Holder>,
    private readonly cryptoService: CryptoService,
  ) {}

  async create(email: string, password: string): Promise<Holder> {
    if (!email) {
      throw new InvalidArgumentError('Email is required');
    }
    if (!EMAIL_REGEX.test(email)) {
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

    const existingHolder = await this.holderModel.findOne({ email });
    if (existingHolder) {
      throw new InvalidArgumentError('Invalid email or password');
    }

    const hashedPassword = await this.cryptoService.hashString(password);

    return this.holderModel.create({ email, password: hashedPassword });
  }

  async findByEmail(email: string): Promise<Holder | null> {
    if (!email) {
      throw new InvalidArgumentError('Email is required');
    }
    if (!EMAIL_REGEX.test(email)) {
      throw new InvalidArgumentError('Email format is invalid');
    }

    return await this.holderModel.findOne({ email });
  }

  async findById(id: string): Promise<Holder> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('ID format is invalid');
    }

    const holder = await this.holderModel.findById(id);
    if (!holder) {
      throw new EntityNotFoundError('Holder not found');
    }

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
