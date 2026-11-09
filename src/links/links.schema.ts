import { Schema, model } from 'mongoose';

import { GrantRoles } from '../grants';
import { LinkType, OneTimeLink } from './link.interface';

const linkSchema = new Schema<OneTimeLink>(
  {
    tokenHash: { type: String, required: true, unique: true },
    type: { type: String, enum: Object.values(LinkType), required: true },
    email: { type: String, lowercase: true, trim: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application' },
    role: { type: String, enum: Object.values(GrantRoles) },
    telegramChatId: { type: String, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    invalidatedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transform: (_doc, ret: any) => {
        delete ret.tokenHash;
        delete ret.telegramChatId;
        delete ret.__v;
        return ret;
      },
    },
  },
);

linkSchema.index({ type: 1, email: 1, applicationId: 1, invalidatedAt: 1 });
linkSchema.index({ type: 1, userId: 1, invalidatedAt: 1 });
// Invitation counters filter by type/used/invalidated and split on expiry.
linkSchema.index({ type: 1, usedAt: 1, invalidatedAt: 1, expiresAt: 1 });
linkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LinkModel = model<OneTimeLink>('Link', linkSchema);
