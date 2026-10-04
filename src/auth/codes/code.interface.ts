import { Types } from 'mongoose';

export interface Code {
  _id: Types.ObjectId;
  code: string;
  subjectId: Types.ObjectId;
  expiresAt: Date;
  type: CodeType;
  used: boolean;
}

export enum CodeType {
  SIGNUP = 'signup',
  RESET_PASSWORD = 'reset_password',
}
