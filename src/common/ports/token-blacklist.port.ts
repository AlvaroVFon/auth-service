export interface TokenBlacklistPort {
  blacklist(jti: string, expiresAt: Date): Promise<void>;
  isBlacklisted(jti: string): Promise<boolean>;
}
