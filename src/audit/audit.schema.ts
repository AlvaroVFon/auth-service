import { Schema, model } from 'mongoose';

import { getNumberEnvVariable } from '../config/env.config';
import { AuditEvent, AuditEventRecord, AuditResult } from './audit.interface';

const retentionDays = getNumberEnvVariable('AUDIT_RETENTION_DAYS', 90);

const auditSchema = new Schema<AuditEventRecord>(
  {
    event: { type: String, enum: Object.values(AuditEvent), required: true },
    result: {
      type: String,
      enum: Object.values(AuditResult),
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, lowercase: true, trim: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application' },
    audience: { type: String, trim: true },
    role: { type: String, trim: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transform: (_doc, ret: any) => {
        delete ret.__v;
        return ret;
      },
    },
  },
);

auditSchema.index({ userId: 1, createdAt: -1 });
auditSchema.index({ targetUserId: 1, createdAt: -1 });
auditSchema.index({ applicationId: 1, createdAt: -1 });
auditSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: retentionDays * 24 * 60 * 60 },
);

export const AuditEventModel = model<AuditEventRecord>(
  'AuditEvent',
  auditSchema,
);
