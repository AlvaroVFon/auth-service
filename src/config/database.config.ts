import mongoose from 'mongoose';
import { LoggerInterface } from '../libs/logger/logger.interface';
import { InfraError } from '../common/exceptions/infra.exceptions';

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
    } catch {
      throw new InfraError('Database connection failed');
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

  async drop(): Promise<void> {
    if (this.connection && this.connection.readyState === 1) {
      try {
        await this.connection.dropDatabase();
        this.logger.info('Database dropped successfully');
      } catch {
        this.logger.error('Failed to drop database');
      }
    }
  }
}
