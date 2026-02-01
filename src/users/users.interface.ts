import { Types } from 'mongoose';
import { Roles } from '../common/enums/roles.enum';

export interface User {
  _id: Types.ObjectId;
  username?: string;
  email: string;
  password: string;
  role: Roles;
}
