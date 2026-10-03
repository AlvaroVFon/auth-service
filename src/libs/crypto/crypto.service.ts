import bcrypt from 'bcrypt';

const DEFAULT_SALT_ROUNDS = 10;

export class CryptoService {
  private readonly defaultSaltRounds: number;

  constructor(defaultSaltRounds?: number) {
    this.defaultSaltRounds =
      defaultSaltRounds ??
      Number(process.env['BCRYPT_SALT_ROUNDS'] ?? DEFAULT_SALT_ROUNDS);
  }

  async hashString(
    password: string,
    saltRounds: number = this.defaultSaltRounds,
  ): Promise<string> {
    return bcrypt.hash(password, saltRounds);
  }

  async compareString(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
