/**
 * Winston logger. Console in every environment, files only when LOG_TO_FILES=true
 * (keeps containers and read-only filesystems happy).
 */
import winston from 'winston';
import { env } from '../config/env';

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: env.isProd
      ? winston.format.combine(winston.format.timestamp(), winston.format.json())
      : winston.format.combine(winston.format.colorize(), winston.format.timestamp({ format: 'HH:mm:ss' }), winston.format.printf((i) => {
          const { timestamp, level, message, ...rest } = i;
          const extra = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
          return `${timestamp} ${level}: ${message}${extra}`;
        }))
  })
];

if (process.env.LOG_TO_FILES === 'true') {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
}

const logger = winston.createLogger({
  level: env.logLevel,
  format: winston.format.combine(winston.format.errors({ stack: true }), winston.format.splat()),
  transports
});

export default logger;
