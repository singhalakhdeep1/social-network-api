/**
 * Payment provider. With STRIPE_SECRET_KEY set, charges are Stripe PaymentIntents that the
 * client confirms with Stripe.js and the /webhooks/stripe endpoint finalises. With no key the
 * "demo" provider approves instantly so the whole monetization flow can be exercised locally.
 */
import Stripe from 'stripe';
import { env } from '../config/env';
import { badInput } from '../utils/errors';
import { randomToken } from '../utils/crypto';

export type PaymentKind = 'tip' | 'subscription' | 'ad';

export interface ChargeRequest {
  amount: number; // major units (e.g. dollars)
  currency: string;
  description: string;
  kind: PaymentKind;
  refId: string;
  extra?: Record<string, string>;
}

export interface ChargeResult {
  mode: 'stripe' | 'demo';
  paymentId: string;
  status: 'succeeded' | 'pending';
  clientSecret?: string;
}

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;

export const paymentMode = (): 'stripe' | 'demo' => (stripe ? 'stripe' : 'demo');

export const charge = async (req: ChargeRequest): Promise<ChargeResult> => {
  if (!stripe) return { mode: 'demo', paymentId: `demo_${randomToken(8)}`, status: 'succeeded' };
  const cents = Math.round(req.amount * 100);
  if (cents < 50) throw badInput('Amount is below the minimum chargeable amount');
  const intent = await stripe.paymentIntents.create({
    amount: cents,
    currency: req.currency.toLowerCase(),
    description: req.description,
    automatic_payment_methods: { enabled: true },
    metadata: { kind: req.kind, refId: req.refId, ...(req.extra ?? {}) }
  });
  return { mode: 'stripe', paymentId: intent.id, status: 'pending', clientSecret: intent.client_secret ?? undefined };
};

export interface PaymentEvent {
  paymentId: string;
  status: 'succeeded' | 'failed';
  metadata: Record<string, string>;
}

/** Verifies a Stripe webhook body and normalises it. Returns null for events we do not act on. */
export const parseStripeWebhook = (rawBody: Buffer, signature: string | undefined): PaymentEvent | null => {
  if (!stripe || !env.stripeWebhookSecret) throw badInput('Stripe webhooks are not configured');
  if (!signature) throw badInput('Missing stripe-signature header');
  const event = stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  if (event.type !== 'payment_intent.succeeded' && event.type !== 'payment_intent.payment_failed') return null;
  const intent = event.data.object as Stripe.PaymentIntent;
  return { paymentId: intent.id, status: event.type === 'payment_intent.succeeded' ? 'succeeded' : 'failed', metadata: intent.metadata as Record<string, string> };
};
