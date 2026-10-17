/**
 * Outgoing webhooks: management plus signed delivery with retries and auto-disable.
 * Each delivery carries `X-Webhook-Signature: sha256=<hmac of the body>` and a timestamp.
 */
import { Types } from 'mongoose';
import Webhook, { IWebhook, WEBHOOK_EVENTS, WebhookEvent } from '../models/Webhook';
import { assertUrl } from '../middleware/validation';
import { badInput, forbidden, notFound } from '../utils/errors';
import { hmacSha256, randomToken } from '../utils/crypto';
import { domainEvents } from '../events/pubsub';
import { HydratedDocument } from 'mongoose';
import logger from '../utils/logger';

const MAX_FAILURES = 10;
const RETRY_DELAYS_MS = [0, 1000, 5000];

const validateEvents = (events: string[]): WebhookEvent[] => {
  const bad = events.filter((e) => !(WEBHOOK_EVENTS as readonly string[]).includes(e));
  if (bad.length) throw badInput(`Unknown webhook events: ${bad.join(', ')}. Allowed: ${WEBHOOK_EVENTS.join(', ')}`);
  if (!events.length) throw badInput('At least one event is required');
  return [...new Set(events)] as WebhookEvent[];
};

/** Blocks webhooks aimed at loopback / private ranges in production (basic SSRF guard). */
const assertPublicTarget = (url: string): void => {
  if (process.env.NODE_ENV !== 'production') return;
  const host = new URL(url).hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?$)/.test(host)) {
    throw badInput('Webhook URL must point to a public host');
  }
};

export const createWebhook = async (userId: string, url: string, events: string[]): Promise<HydratedDocument<IWebhook>> => {
  assertUrl(url, 'Webhook URL');
  assertPublicTarget(url);
  const count = await Webhook.countDocuments({ user: userId });
  if (count >= 20) throw badInput('Webhook limit reached (20)');
  return Webhook.create({ user: userId, url, events: validateEvents(events), secret: randomToken(24) });
};

export const updateWebhook = async (userId: string, id: string, patch: { url?: string | null; events?: string[] | null; isActive?: boolean | null }): Promise<HydratedDocument<IWebhook>> => {
  const hook = await Webhook.findById(id);
  if (!hook) throw notFound('Webhook');
  if (hook.user.toString() !== userId) throw forbidden();
  if (patch.url) {
    assertUrl(patch.url, 'Webhook URL');
    assertPublicTarget(patch.url);
    hook.url = patch.url;
  }
  if (patch.events) hook.events = validateEvents(patch.events);
  if (typeof patch.isActive === 'boolean') {
    hook.isActive = patch.isActive;
    if (patch.isActive) hook.failureCount = 0;
  }
  return hook.save();
};

export const deleteWebhook = async (userId: string, id: string): Promise<boolean> => {
  const res = await Webhook.deleteOne({ _id: id, user: userId });
  return res.deletedCount === 1;
};

export const listWebhooks = (userId: string): Promise<HydratedDocument<IWebhook>[]> => Webhook.find({ user: userId }).sort({ createdAt: -1 }).exec();

export const getWebhook = async (userId: string, id: string): Promise<HydratedDocument<IWebhook>> => {
  const hook = await Webhook.findOne({ _id: id, user: userId });
  if (!hook) throw notFound('Webhook');
  return hook;
};

async function deliver(hook: HydratedDocument<IWebhook>, event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({ id: randomToken(8), event, createdAt: new Date().toISOString(), data });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = hmacSha256(hook.secret, `${timestamp}.${body}`);
  let status = 0;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-webhook-event': event,
          'x-webhook-timestamp': timestamp,
          'x-webhook-signature': `sha256=${signature}`
        },
        body,
        signal: AbortSignal.timeout(5000)
      });
      status = res.status;
      if (res.ok) break;
    } catch (err) {
      logger.debug(`webhook ${hook.id} delivery error: ${(err as Error).message}`);
    }
  }
  const ok = status >= 200 && status < 300;
  if (ok) {
    await Webhook.updateOne({ _id: hook._id }, { lastTriggered: new Date(), lastStatus: status, failureCount: 0, $inc: { triggerCount: 1 } });
    return;
  }
  const updated = await Webhook.findByIdAndUpdate(hook._id, { lastTriggered: new Date(), lastStatus: status, $inc: { triggerCount: 1, failureCount: 1 } }, { new: true });
  if (updated && updated.failureCount >= MAX_FAILURES) {
    await Webhook.updateOne({ _id: hook._id }, { isActive: false });
    logger.warn(`webhook ${hook.id} disabled after ${MAX_FAILURES} consecutive failures`);
  }
}

/** Fire-and-forget fan-out to a user's active webhooks that subscribe to `event`. */
export const triggerWebhooks = (userId: string | Types.ObjectId, event: WebhookEvent, data: Record<string, unknown>): void => {
  void (async () => {
    const hooks = await Webhook.find({ user: userId, isActive: true, events: event });
    await Promise.all(hooks.map((h) => deliver(h, event, data).catch((e) => logger.warn(`webhook delivery failed: ${e.message}`))));
  })().catch((e) => logger.warn(`webhook trigger failed: ${e.message}`));
};

domainEvents.on('webhook', (p: { userId: string; event: WebhookEvent; data: Record<string, unknown> }) => triggerWebhooks(p.userId, p.event, p.data));
