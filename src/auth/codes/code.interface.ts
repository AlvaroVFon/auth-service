import { Types } from 'mongoose';

export interface Code {
  _id: Types.ObjectId;
  code: string;
  holderId: Types.ObjectId;
  expiresAt: Date;
  type: CodeType;
  used: boolean;
}

export interface CreateCodeDTO {
  holderId: Types.ObjectId;
  expiresAt: Date;
}

export enum CodeType {
  SIGNUP = 'signup',
  PASSWORD_RESET = 'password_reset',
}
