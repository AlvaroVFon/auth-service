import mongoose from 'mongoose';
import { LoggerInterface } from '../libs/logger/logger.interface';
import { InfraError } from '../common/exceptions/infra.exceptions';

let db: mongoose.Connection | null = null;

export class Database {
  constructor(
    private readonly connectionString: string,
    private readonly logger: LoggerInterface,
  ) {}

  async connect(): Promise<void> {
    try {
      const connection = await mongoose.connect(this.connectionString);
      db = connection.connection;
      this.logger.info('Database connected successfully');
    } catch {
      throw new InfraError('Database connection failed');
    }
  }

  async close(): Promise<void> {
    if (db) {
      await mongoose.disconnect();
      db = null;
      this.logger.info('Database connection closed');
    } else {
      this.logger.warn('No database connection to close');
    }
  }

  async flush(): Promise<void> {
    if (db) {
      const collections = Object.keys(db.collections);
      for (const collectionName of collections) {
        const collection = db.collections[collectionName];
        if (!collection) continue;
        await collection.deleteMany({});
      }
      this.logger.info('Database flushed successfully');
    } else {
      this.logger.warn('No database connection to flush');
    }
  }

  getConnection(): mongoose.Connection | null {
    if (!db) {
      this.logger.warn('Database not connected yet');
    }
    return db;
  }

  async drop(dbName: string): Promise<void> {
    if (db && db.name === dbName) {
      await db.dropDatabase();
      this.logger.info('Database dropped successfully');
    } else {
      this.logger.warn('No database connection to drop');
    }
  }
}
