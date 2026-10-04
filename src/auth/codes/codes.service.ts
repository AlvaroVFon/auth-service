import { Model, Types } from 'mongoose';

import { OBJECTID_REGEX } from '../../common/constants/regex';
import { InvalidArgumentError } from '../../common/exceptions/base.exception';
import {
  AlreadyGeneratedCodeError,
  InvalidCodeError,
} from '../../common/exceptions/codes.exceptions';
import { Code, CodeType } from './code.interface';

export class CodesService {
  private readonly ALPHANUMERIC: string =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  constructor(
    private readonly codeModel: Model<Code>,
    private readonly codeExpirationMs: number = 3_600_000,
    private readonly codeLength: number = 6,
  ) {}

  async create(subjectId: string, type: CodeType): Promise<Code> {
    if (!subjectId) {
      throw new InvalidArgumentError('subjectId is required');
    }
    if (!OBJECTID_REGEX.test(subjectId)) {
      throw new InvalidArgumentError('Invalid subjectId');
    }
    if (!type) {
      throw new InvalidArgumentError('codeType is required');
    }
    if (!Object.values(CodeType).includes(type)) {
      throw new InvalidArgumentError('Invalid codeType');
    }

    const existingCode = await this.codeModel.findOne({
      subjectId: new Types.ObjectId(subjectId),
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
      subjectId: new Types.ObjectId(subjectId),
      type,
    });
  }

  async validateCode(
    subjectId: string,
    code: string,
    type: CodeType,
  ): Promise<void> {
    if (!subjectId) {
      throw new InvalidArgumentError('subjectId is required');
    }
    if (!OBJECTID_REGEX.test(subjectId)) {
      throw new InvalidArgumentError('Invalid subjectId');
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

    const existingCode = await this.codeModel.findOneAndUpdate(
      {
        subjectId: new Types.ObjectId(subjectId),
        type,
        code,
        used: false,
        expiresAt: { $gt: new Date() },
      },
      { $set: { used: true } },
      { returnDocument: 'after' },
    );

    if (!existingCode) {
      throw new InvalidCodeError(
        'The provided code is invalid, used or expired',
      );
    }
  }

  async deleteById(id: string): Promise<void> {
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('Invalid code ID');
    }

    await this.codeModel.findByIdAndDelete(id);
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
