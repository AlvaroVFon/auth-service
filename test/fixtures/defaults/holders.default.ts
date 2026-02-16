import { Types } from 'mongoose';

export const DEFAULT_HOLDER_ID = new Types.ObjectId('000000000000000000000003');

export const DEFAULT_HOLDER = {
  _id: DEFAULT_HOLDER_ID,
  email: 'default.holder@example.com',
  password: '$2b$10$njKm0/jBAa8VjVT4XXTbOOUqALanrKZLGrPaWXIACh6iZpoI1NUzm',
};
