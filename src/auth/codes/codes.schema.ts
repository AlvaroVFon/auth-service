import { Schema, model } from 'mongoose';
import { Code, CodeType } from './code.interface';

export const CodesSchema = new Schema<Code>(
  {
    code: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
    type: {
      type: String,
      enum: Object.values(CodeType),
      default: CodeType.SIGNUP,
    },
  },
  { timestamps: true },
);

export const CodesModel = model<Code>('Code', CodesSchema);
