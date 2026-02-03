import { Model, Types } from 'mongoose';
import { Code, CodeType } from './code.interface';
import { getNumberEnvVariable } from '../../config/env.config';
import { OBJECTID_REGEX } from '../../common/constants/regex';
import { InvalidArgumentError } from '../../common/exceptions/base.exception';
import {
  AlreadyGeneratedCodeError,
  InvalidCodeError,
} from '../../common/exceptions/codes.exceptions';

export class CodesService {
  private readonly ALPHANUMERIC: string =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  private readonly codeLength: number;
  private readonly codeExpirationMs: number;

  constructor(private readonly codeModel: Model<Code>) {
    this.codeExpirationMs = getNumberEnvVariable('CODE_EXPIRATION_MS', 3600000);
    this.codeLength = getNumberEnvVariable('CODE_LENGTH', 6);
  }

  async create(userId: string, type: CodeType): Promise<Code> {
    if (!userId) {
      throw new InvalidArgumentError('userId is required');
    }
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('Invalid userId');
    }
    if (!type) {
      throw new InvalidArgumentError('codeType is required');
    }
    if (!Object.values(CodeType).includes(type)) {
      throw new InvalidArgumentError('Invalid codeType');
    }

    const existingCode = await this.codeModel.findOne({
      userId: new Types.ObjectId(userId),
      type,
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (existingCode) {
      throw new AlreadyGeneratedCodeError(
        'A valid code has already been generated for this user and type',
      );
    }

    return this.codeModel.create({
      code: this.generateCode(),
      expiresAt: new Date(Date.now() + this.codeExpirationMs),
      userId: new Types.ObjectId(userId),
      type,
    });
  }

  async validateCode(
    userId: string,
    code: string,
    type: CodeType,
  ): Promise<void> {
    if (!userId) {
      throw new InvalidArgumentError('userId is required');
    }
    if (!OBJECTID_REGEX.test(userId)) {
      throw new InvalidArgumentError('Invalid userId');
    }
    if (!code) {
      throw new InvalidArgumentError('code is required');
    }
    if (!type) {
      throw new InvalidArgumentError('codeType is required');
    }
    if (!Object.values(CodeType).includes(type)) {
      throw new InvalidArgumentError('Invalid codeType');
    }

    const existingCode = await this.codeModel.findOne({
      userId: new Types.ObjectId(userId),
      type,
      used: false,
    });

    const isValidCode =
      existingCode?.code === code && existingCode.expiresAt > new Date();

    if (!isValidCode) {
      throw new InvalidCodeError(
        'The provided code is invalid, used or expired',
      );
    }

    existingCode.used = true;
    await existingCode.save();
  }

  generateCode(
    length: number = this.codeLength,
    validCharacters: string = this.ALPHANUMERIC,
  ): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * validCharacters.length);
      result += validCharacters[randomIndex];
    }
    return result;
  }
}
