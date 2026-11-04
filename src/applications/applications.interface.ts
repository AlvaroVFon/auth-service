import { Types } from 'mongoose';

import { ApplicationSettings } from '../settings/settings.interface';

export interface Application {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  audience: string;
  active: boolean;
  settings?: ApplicationSettings;
}
