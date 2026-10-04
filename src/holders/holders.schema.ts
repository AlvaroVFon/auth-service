import { Schema, model } from 'mongoose';

import { getNumberEnvVariable } from '../config/env.config';
import { Holder } from './holders.interface';

const holderExpiration = getNumberEnvVariable('HOLDER_EXPIRATION_MS', 3600000);

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
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        const { password, __v, ...rest } = ret;
        void password;
        void __v;
        return rest;
      },
    },
  },
);

HoldersSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const HoldersModel = model<Holder>('Holder', HoldersSchema);
