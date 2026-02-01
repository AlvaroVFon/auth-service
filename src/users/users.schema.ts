import { Schema, model } from 'mongoose';
import { User as UserInterface } from './users.interface';

const userSchema = new Schema<UserInterface>(
  {
    username: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transform: (_doc, ret: any) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export const User = model<UserInterface>('User', userSchema);
