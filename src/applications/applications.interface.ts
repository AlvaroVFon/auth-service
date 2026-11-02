import { Types } from 'mongoose';

export interface Application {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  audience: string;
  active: boolean;
}
