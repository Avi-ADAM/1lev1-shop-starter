import type { PageServerLoad } from './$types';
import { getOrder, levConfig, orderRefOf } from '$lib/server/lev';
import { payments } from '$lib/server/payments';
import { rikmaOf } from '$lib/server/shop';
import type { OrderView } from '$lib/types';

/**
 * "Thank you" — where the provider sends the buyer back. The payment is
 * asked of the provider, the order of 1lev1; the two can be a few seconds
 * apart (the webhook may not have arrived yet), and the page says so and
 * looks again instead of claiming the order is lost.
 */
export const load: PageServerLoad = async ({ params, setHeaders }) => {
  setHeaders({ 'cache-control': 'no-store' });
  const payment = await payments().lookupPayment(params.id);
  if (payment.state !== 'paid' || !payment.externalId) {
    return { state: payment.state, order: null as OrderView | null };
  }
  try {
    const cfg = levConfig();
    const rikma = await rikmaOf(cfg);
    const order = await getOrder(cfg, orderRefOf(rikma.id, payment.externalId));
    return { state: order ? ('recorded' as const) : ('recording' as const), order };
  } catch (e) {
    console.error('[shop] order lookup failed:', e);
    return { state: 'recording' as const, order: null as OrderView | null };
  }
};
