import { Schema, model } from 'mongoose';
import { Code, CodeType } from './code.interface';

export const CodesSchema = new Schema<Code>(
  {
    code: { type: String, required: true },
    holderId: { type: Schema.Types.ObjectId, ref: 'Holder', required: true },
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

CodesSchema.index({ userId: 1, type: 1, used: 1 });

export const CodesModel = model<Code>('Code', CodesSchema);
