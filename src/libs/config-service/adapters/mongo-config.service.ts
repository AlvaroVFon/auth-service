import { Model } from 'mongoose';
import type { ConfigEntry, ConfigService } from '../config-service.interface';

export class MongoConfigService implements ConfigService {
  constructor(private readonly configEntryModel: Model<ConfigEntry>) {}

  async get<T>(key: string): Promise<T | null> {
    const entry = await this.configEntryModel.findOne({ key }).lean().exec();
    return (entry?.value as T) ?? null;
  }
}
