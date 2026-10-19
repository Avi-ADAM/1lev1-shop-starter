import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { payments } from '$lib/server/payments';
import { recordOrder } from '$lib/server/record';

/**
 * PayPal sends the buyer back here after they approve (`?token=<order id>`).
 * Nothing is charged until now: capture the money, report the order, and
 * show the thank-you page.
 *
 * If 1lev1 cannot take the order at this moment, the buyer still sees "paid,
 * recording" — PayPal's `PAYMENT.CAPTURE.COMPLETED` webhook reports it again.
 */
export const GET: RequestHandler = async ({ url }) => {
  const adapter = payments('paypal');
  let result;
  try {
    result = await adapter.confirmReturn!(url);
  } catch (e) {
    console.error('[shop] PayPal capture failed:', e);
    redirect(303, '/cart?payment=failed');
  }

  if (!result.paymentId) redirect(303, '/cart');
  if (result.shippingRefused) redirect(303, '/cart?payment=shipping');
  if (result.outcome.kind === 'paid' && result.outcome.order.lines.length > 0) {
    await recordOrder(result.outcome.order);
  }
  redirect(303, `/order/${encodeURIComponent(result.paymentId)}`);
};
