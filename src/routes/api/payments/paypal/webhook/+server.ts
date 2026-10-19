import type { RequestHandler } from './$types';
import { payments } from '$lib/server/payments';
import { answerWebhook } from '$lib/server/record';

/**
 * PayPal's notices. The buyer's return already records the order; this is the
 * safety net — a buyer who approved and closed the tab, or a capture that was
 * pending and has now cleared. Recording twice is harmless (one order per
 * PayPal order id).
 */
export const POST: RequestHandler = ({ request }) => answerWebhook(payments('paypal'), request);
