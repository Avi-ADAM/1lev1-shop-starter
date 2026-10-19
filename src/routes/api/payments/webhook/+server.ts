import type { RequestHandler } from './$types';
import { payments } from '$lib/server/payments';
import { answerWebhook } from '$lib/server/record';

/**
 * Stripe tells this endpoint a payment went through, and this endpoint tells
 * 1lev1. (PayPal's notices go to `/api/payments/paypal/webhook`.) See
 * `answerWebhook` for why every failure answers non-2xx.
 */
export const POST: RequestHandler = ({ request }) => answerWebhook(payments('stripe'), request);
