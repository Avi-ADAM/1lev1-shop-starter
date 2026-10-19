import type { PageServerLoad } from './$types';
import { getOrder, levConfig, orderRefOf } from '$lib/server/lev';
import { paymentsFor } from '$lib/server/payments';
import { isArrangedId, shopWhatsapp } from '$lib/server/arranged';
import { rikmaOf } from '$lib/server/shop';
import type { OrderView } from '$lib/types';

/**
 * "Thank you" — where the provider sends the buyer back. The payment is
 * asked of the provider, the order of 1lev1; the two can be a few seconds
 * apart (the webhook may not have arrived yet), and the page says so and
 * looks again instead of claiming the order is lost.
 *
 * An order paid by arrangement (`arr_…`) has no provider to ask: the order
 * itself is the answer — "awaiting arrangement" until the shop records the
 * payment, then the same page as any paid order.
 */
export const load: PageServerLoad = async ({ params, setHeaders }) => {
  setHeaders({ 'cache-control': 'no-store' });
  const whatsapp = shopWhatsapp();

  if (isArrangedId(params.id)) {
    try {
      const cfg = levConfig();
      const rikma = await rikmaOf(cfg);
      const order = await getOrder(cfg, orderRefOf(rikma.id, params.id));
      if (!order) return { state: 'unknown' as const, order: null as OrderView | null, whatsapp };
      return {
        state: order.status === 'pendingPayment' ? ('arranging' as const) : ('recorded' as const),
        order,
        whatsapp
      };
    } catch (e) {
      console.error('[shop] order lookup failed:', e);
      return { state: 'unknown' as const, order: null as OrderView | null, whatsapp };
    }
  }

  const adapter = paymentsFor(params.id);
  const payment = adapter
    ? await adapter.lookupPayment(params.id)
    : { state: 'unknown' as const, externalId: null };
  if (payment.state !== 'paid' || !payment.externalId) {
    return { state: payment.state, order: null as OrderView | null, whatsapp };
  }
  try {
    const cfg = levConfig();
    const rikma = await rikmaOf(cfg);
    const order = await getOrder(cfg, orderRefOf(rikma.id, payment.externalId));
    return { state: order ? ('recorded' as const) : ('recording' as const), order, whatsapp };
  } catch (e) {
    console.error('[shop] order lookup failed:', e);
    return { state: 'recording' as const, order: null as OrderView | null, whatsapp };
  }
};
