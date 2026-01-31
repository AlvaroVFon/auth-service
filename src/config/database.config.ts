import mongoose from 'mongoose';
import { LoggerInterface } from '../common/interceptors/httplogger.interceptor';

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
      this.logger.log('Database connected successfully');
    } catch (error) {
      this.logger.error('Error connecting to database:', error);
    }
  }

  async close(): Promise<void> {
    if (db) {
      await mongoose.disconnect();
      db = null;
      this.logger.log('Database connection closed');
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
      this.logger.log('Database flushed successfully');
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
      this.logger.log('Database dropped successfully');
    } else {
      this.logger.warn('No database connection to drop');
    }
  }
}
