import { Types } from 'mongoose';

export interface Code {
  code: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  type: CodeType;
  used: boolean;
}

export interface CreateCodeDTO {
  userId: Types.ObjectId;
  expiresAt: Date;
}

export enum CodeType {
  SIGNUP = 'signup',
  PASSWORD_RESET = 'password_reset',
}
