import mongoose, { Model, Schema } from 'mongoose';

import { getNumberEnvVariable } from '../config/env.config';
import { AuditEvent, AuditEventRecord, AuditResult } from './audit.interface';

const MODEL_NAME = 'AuditEvent';

const resolveRetentionDays = (retentionDays: number): number => {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error('AUDIT_RETENTION_DAYS must be a positive number');
  }

  return retentionDays;
};

export const createAuditSchema = (
  retentionDays: number,
): Schema<AuditEventRecord> => {
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
      sessionId: { type: String },
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
  auditSchema.index({ event: 1, createdAt: -1 });
  auditSchema.index({ email: 1, createdAt: -1 });
  auditSchema.index({ actorId: 1, createdAt: -1 });
  // Serves the default listing order, whose stable tie break is `_id`; the TTL
  // index cannot carry the second key.
  auditSchema.index({ createdAt: 1, _id: 1 });
  auditSchema.index(
    { createdAt: 1 },
    {
      expireAfterSeconds: resolveRetentionDays(retentionDays) * 24 * 60 * 60,
    },
  );

  return auditSchema;
};

/**
 * Creates the model once, reading the retention value at composition time so
 * `.env` is already loaded (module-level evaluation happens before that).
 */
export const createAuditEventModel = (
  retentionDays = getNumberEnvVariable('AUDIT_RETENTION_DAYS', 90),
): Model<AuditEventRecord> => {
  const existing = mongoose.models[MODEL_NAME] as
    | Model<AuditEventRecord>
    | undefined;

  if (existing) {
    return existing;
  }

  return mongoose.model<AuditEventRecord>(
    MODEL_NAME,
    createAuditSchema(retentionDays),
  );
};
