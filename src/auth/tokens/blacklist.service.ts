import { Model } from 'mongoose';

import { TokenBlacklistPort } from '../../common/ports/token-blacklist.port';
import { BlacklistedToken } from './blacklisted-token.interface';

export class BlacklistService implements TokenBlacklistPort {
  constructor(private readonly model: Model<BlacklistedToken>) {}

  async blacklist(jti: string, expiresAt: Date): Promise<void> {
    await this.model.findOneAndUpdate(
      { jti },
      { $setOnInsert: { jti, expiresAt } },
      { upsert: true },
    );
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    const entry = await this.model.exists({ jti });
    return entry !== null;
  }
}
