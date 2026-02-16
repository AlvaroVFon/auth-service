import { Schema, model } from 'mongoose';
import { Holder } from './holders.interface';
import { getNumberEnvVariable } from '../config/env.config';

const holderExpiration = getNumberEnvVariable('CODE_EXPIRATION_MS');

const HoldersSchema = new Schema<Holder>(
  {
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + holderExpiration),
    },
  },
  {
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

HoldersSchema.index({ expiresAt: 1 }, { expireAfterSeconds: holderExpiration });

export const HoldersModel = model<Holder>('Holder', HoldersSchema);
