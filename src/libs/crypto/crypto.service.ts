import bcrypt from 'bcrypt';

export class CryptoService {
  async hashString(password: string, saltRounds: number = 10): Promise<string> {
    return bcrypt.hash(password, saltRounds);
  }

  async compareString(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
