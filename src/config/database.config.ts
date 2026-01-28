import mongoose from 'mongoose';

let db: mongoose.Connection | null = null;

const connectDB = async (uri: string): Promise<void> => {
  try {
    const connection = await mongoose.connect(uri);
    db = connection.connection;
    console.log('Database connected successfully');
  } catch (error) {
    console.log('Error connecting to database:', error);
  }
};

const closeDB = async (): Promise<void> => {
  if (db) {
    await mongoose.disconnect();
    db = null;
    console.log('Database connection closed');
  } else {
    console.warn('No database connection to close');
  }
};

const flushDB = async (): Promise<void> => {
  if (db) {
    const collections = Object.keys(db.collections);
    for (const collectionName of collections) {
      const collection = db.collections[collectionName];
      await collection.deleteMany({});
    }
    console.log('Database flushed successfully');
  } else {
    console.warn('No database connection to flush');
  }
};

const getDB = (): mongoose.Connection | null => {
  if (!db) {
    console.warn('Database not connected yet');
  }
  return db;
};

export { connectDB, closeDB, flushDB, getDB };
