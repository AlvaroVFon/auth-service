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
  { timestamps: true },
);

export const User = model<UserInterface>('User', userSchema);
