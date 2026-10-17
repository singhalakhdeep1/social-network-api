/**
 * Typed environment configuration. Loaded once; every other module imports `env`.
 */
import * as dotenv from 'dotenv';

dotenv.config();

const str = (key: string, fallback = ''): string => process.env[key] ?? fallback;
const num = (key: string, fallback: number): number => {
  const raw = process.env[key];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
};

const nodeEnv = str('NODE_ENV', 'development');
const isProd = nodeEnv === 'production';

if (isProd && (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET)) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in production');
}

export const env = {
  nodeEnv,
  isProd,
  port: num('PORT', 4000),
  publicUrl: str('PUBLIC_URL', `http://localhost:${num('PORT', 4000)}`),
  frontendUrl: str('FRONTEND_URL', 'http://localhost:3100'),
  corsOrigins: str('CORS_ORIGINS', 'http://localhost:3100').split(',').map((s) => s.trim()).filter(Boolean),
  logLevel: str('LOG_LEVEL', 'info'),

  mongoUri: str('MONGODB_URI', 'mongodb://localhost:27017/social-network-api'),

  redisUrl: str('REDIS_URL', ''),
  redisHost: str('REDIS_HOST', 'localhost'),
  redisPort: num('REDIS_PORT', 6379),

  jwtSecret: str('JWT_SECRET', 'dev-only-access-secret-change-me'),
  jwtExpire: str('JWT_EXPIRE', '15m'),
  jwtRefreshSecret: str('JWT_REFRESH_SECRET', 'dev-only-refresh-secret-change-me'),
  jwtRefreshExpire: str('JWT_REFRESH_EXPIRE', '7d'),
  adminEmails: str('ADMIN_EMAILS', '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  messageEncryptionKey: str('MESSAGE_ENCRYPTION_KEY', 'dev-only-message-encryption-key-change-me'),

  maxQueryDepth: num('MAX_QUERY_DEPTH', 10),
  maxQueryComplexity: num('MAX_QUERY_COMPLEXITY', 1500),
  maxFileSize: num('MAX_FILE_SIZE', 10 * 1024 * 1024),
  uploadDir: str('UPLOAD_DIR', 'uploads'),

  rateLimitBucketCapacity: num('RATE_LIMIT_BUCKET_CAPACITY', 100),
  rateLimitRefillRate: num('RATE_LIMIT_REFILL_RATE', 5),
  /** Login / register / password-reset attempts per IP: burst size and sustained rate. */
  authRateLimitCapacity: num('AUTH_RATE_LIMIT_CAPACITY', 10),
  authRateLimitPerMinute: num('AUTH_RATE_LIMIT_PER_MINUTE', 10),

  elasticsearchUrl: str('ELASTICSEARCH_URL', ''),
  elasticsearchUsername: str('ELASTICSEARCH_USERNAME', ''),
  elasticsearchPassword: str('ELASTICSEARCH_PASSWORD', ''),

  graphProvider: str('GRAPH_PROVIDER', 'mongo') as 'mongo' | 'neo4j' | 'janusgraph',
  neo4jUri: str('NEO4J_URI', 'bolt://localhost:7687'),
  neo4jUser: str('NEO4J_USER', str('NEO4J_USERNAME', 'neo4j')),
  neo4jPassword: str('NEO4J_PASSWORD', 'password'),
  janusgraphUrl: str('JANUSGRAPH_URL', `ws://${str('JANUSGRAPH_HOST', 'localhost')}:${num('JANUSGRAPH_PORT', 8182)}/gremlin`),

  grpcEnabled: bool('GRPC_ENABLED', true),
  grpcPort: num('GRPC_PORT', 50051),

  emailHost: str('EMAIL_HOST', ''),
  emailPort: num('EMAIL_PORT', 587),
  emailUser: str('EMAIL_USER', ''),
  emailPass: str('EMAIL_PASS', ''),
  emailFrom: str('EMAIL_FROM', 'Social Network <noreply@socialnetwork.local>'),

  stripeSecretKey: str('STRIPE_SECRET_KEY', ''),
  stripeWebhookSecret: str('STRIPE_WEBHOOK_SECRET', ''),

  enableMetrics: bool('ENABLE_METRICS', true),
  enableCron: bool('ENABLE_CRON', true)
};

export type Env = typeof env;
