import { Model, Types } from 'mongoose';
import { User as UserInterface } from '../users/users.interface';
import {
  EntityAlreadyExistsError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class UsersService {
  constructor(private readonly usersModel: Model<UserInterface>) {}

  async create(data: Partial<UserInterface>): Promise<UserInterface> {
    if (!data.email) {
      throw new InvalidArgumentError('Email is required to create a user');
    }
    if (!EMAIL_REGEX.test(data.email)) {
      throw new InvalidArgumentError('Invalid email format');
    }

    const existingUser = await this.usersModel.findOne({ email: data.email });
    if (existingUser) {
      throw new EntityAlreadyExistsError('Email already exists');
    }

    return this.usersModel.create(data);
  }

  async findByEmail(email: string): Promise<UserInterface | null> {
    if (!email) {
      throw new InvalidArgumentError('Email is required');
    }

    if (!EMAIL_REGEX.test(email)) {
      throw new InvalidArgumentError('Invalid email format');
    }

    return this.usersModel.findOne({ email });
  }

  async findById(id: string): Promise<UserInterface | null> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!Types.ObjectId.isValid(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }

    return this.usersModel.findById(id);
  }

  async updateOneById(
    id: string,
    updateData: Partial<UserInterface>,
  ): Promise<UserInterface | null> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!Types.ObjectId.isValid(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }

    return this.usersModel.findByIdAndUpdate(id, updateData, { new: true });
  }

  async deleteOneById(id: string): Promise<UserInterface | null> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!Types.ObjectId.isValid(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }

    return this.usersModel.findByIdAndDelete(id);
  }
}
