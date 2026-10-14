/**
 * Scheduled jobs (node-cron). Each run takes a short Redis lock so that when several API
 * instances run, only one executes a given tick. Without Redis every instance runs the job,
 * which is safe because each job claims its rows atomically.
 */
import cron, { ScheduledTask } from 'node-cron';
import { randomBytes } from 'crypto';
import { getRedis } from '../config/redis';
import { env } from '../config/env';
import { processDueScheduledPosts } from '../services/content.service';
import { completeFinishedAds, processSubscriptionRenewals } from '../services/monetization.service';
import { runStoryExpiry } from './storyExpiry';
import logger from '../utils/logger';

const withLock = async (name: string, ttlSeconds: number, fn: () => Promise<unknown>): Promise<void> => {
  const redis = getRedis();
  if (redis) {
    try {
      const ok = await redis.set(`lock:job:${name}`, randomBytes(6).toString('hex'), 'EX', ttlSeconds, 'NX');
      if (ok !== 'OK') return; // another instance has this tick
    } catch {
      /* redis hiccup: run anyway */
    }
  }
  try {
    await fn();
  } catch (err) {
    logger.error(`job ${name} failed: ${(err as Error).message}`);
  }
};

const tasks: ScheduledTask[] = [];

export const startJobs = (): void => {
  if (!env.enableCron) {
    logger.info('Jobs disabled (ENABLE_CRON=false)');
    return;
  }
  const add = (expr: string, name: string, ttl: number, fn: () => Promise<unknown>) => tasks.push(cron.schedule(expr, () => void withLock(name, ttl, fn)));

  add('* * * * *', 'scheduled-posts', 50, async () => {
    const n = await processDueScheduledPosts();
    if (n) logger.info(`Published ${n} scheduled post(s)`);
  });
  add('*/10 * * * *', 'story-expiry', 540, runStoryExpiry);
  add('0 * * * *', 'ads-complete', 3000, async () => {
    const n = await completeFinishedAds();
    if (n) logger.info(`Completed ${n} finished ad(s)`);
  });
  add('0 3 * * *', 'subscription-renewals', 3600, async () => {
    const r = await processSubscriptionRenewals();
    if (r.renewed || r.lapsed) logger.info(`Subscriptions: ${r.renewed} renewed, ${r.lapsed} lapsed`);
  });

  // catch up on anything that came due while the server was down
  void withLock('scheduled-posts-boot', 30, processDueScheduledPosts);
  void withLock('story-expiry-boot', 30, runStoryExpiry);
  logger.info('Background jobs scheduled (scheduled posts, story expiry, ads, subscription renewals)');
};

export const stopJobs = (): void => {
  tasks.forEach((t) => t.stop());
  tasks.length = 0;
};
