import mongoose from 'mongoose';

import { InfraError } from '../common/exceptions/infra.exceptions';
import { LoggerInterface } from '../libs/logger';

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const CREDENTIALS_IN_URI = /(mongodb(?:\+srv)?:\/\/)[^@\s/]+@/gi;

export const redactCredentials = (message: string): string =>
  message.replace(CREDENTIALS_IN_URI, '$1***@');

const describeError = (error: unknown): string => {
  const normalized = toError(error);
  return `${normalized.name}: ${redactCredentials(normalized.message)}`;
};

export class Database {
  private connection: mongoose.Connection | null = null;

  constructor(
    private readonly connectionString: string,
    private readonly logger: LoggerInterface,
  ) {}

  async connect(): Promise<void> {
    try {
      const connection = await mongoose.connect(this.connectionString);
      this.connection = connection.connection;
      this.logger.info('Database connected successfully');
    } catch (error) {
      this.logger.error(`Database connection failed: ${describeError(error)}`);
      throw new InfraError('Database connection failed', { cause: error });
    }
  }

  async close(): Promise<void> {
    if (this.connection) {
      await mongoose.disconnect();
      this.connection = null;
      this.logger.info('Database connection closed');
    } else {
      this.logger.warn('No database connection to close');
    }
  }

  async flush(): Promise<void> {
    if (this.connection) {
      const collections = Object.keys(this.connection.collections);
      for (const collectionName of collections) {
        const collection = this.connection.collections[collectionName];
        if (!collection) continue;
        await collection.deleteMany({});
      }
      this.logger.info('Database flushed successfully');
    } else {
      this.logger.warn('No database connection to flush');
    }
  }

  getConnection(): mongoose.Connection | null {
    if (!this.connection) {
      this.logger.warn('Database not connected yet');
    }
    return this.connection;
  }

  getReadyState(): number {
    return this.connection?.readyState ?? 0;
  }

  async drop(): Promise<void> {
    if (this.connection && this.connection.readyState === 1) {
      try {
        await this.connection.dropDatabase();
        this.logger.info('Database dropped successfully');
      } catch (error) {
        this.logger.error(`Failed to drop database: ${describeError(error)}`);
      }
    }
  }
}
