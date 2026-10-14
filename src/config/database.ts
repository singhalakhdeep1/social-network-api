/**
 * MongoDB connection.
 */
import mongoose from 'mongoose';
import { env } from './env';
import logger from '../utils/logger';

export const connectDatabase = async (): Promise<void> => {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
  logger.info(`MongoDB connected (${mongoose.connection.name})`);
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
};
