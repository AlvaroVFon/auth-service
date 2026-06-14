import { Schema, model } from 'mongoose';
import { Tenant } from './tentants.interface';

const tenantSchema = new Schema<Tenant>({
  name: { type: String, required: true, trim: true },
  active: { type: Boolean, required: true },
  description: { type: String, required: true, trim: true },
  secret: { type: String, required: true, unique: true },
});

export const TenantsModel = model<Tenant>('Tenant', tenantSchema);
