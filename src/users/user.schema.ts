import { Schema, model } from 'mongoose';
import { User as UserInterface } from './user.interface';

const userSchema = new Schema<UserInterface>({
  username: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
});

export const User = model<UserInterface>('User', userSchema);
