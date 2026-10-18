import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProduct, levConfig } from '$lib/server/lev';
import { priceCart } from '$lib/server/cart';
import { payments, siteUrlOf } from '$lib/server/payments';
import { newDisplayNumber } from '$lib/server/shop';
import { LANG, t } from '$lib/texts';

/**
 * Open the payment page. The cart is priced again here, from the catalog —
 * if anything moved since the buyer looked (a price, the stock, a product
 * taken off the shelf) they get the corrected cart back to review, and no
 * payment page, rather than a charge they did not see.
 */
export const POST: RequestHandler = async ({ request, url }) => {
  const body = await request.json().catch(() => ({}));
  const cfg = levConfig();
  const priced = await priceCart(body?.items, (id) => getProduct(cfg, id));

  const seen = Number(body?.expectedSubtotal);
  const moved = priced.problems.length > 0 || (Number.isFinite(seen) && seen !== priced.subtotal);
  if (moved || priced.lines.length === 0 || !priced.currency) {
    return json({ ok: false, reason: 'changed', cart: priced }, { status: 409 });
  }

  const delivery = priced.delivery.find((d) => d.kind === body?.delivery) ?? priced.delivery[0];
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) || null : null;

  try {
    const { redirectUrl } = await payments().createCheckout({
      lines: priced.lines,
      currency: priced.currency,
      delivery,
      deliveryLabel: t.deliveryKinds[delivery.kind] ?? t.deliveryFee,
      displayNumber: newDisplayNumber(),
      note,
      locale: LANG,
      siteUrl: siteUrlOf(url)
    });
    return json({ ok: true, redirectUrl });
  } catch (e) {
    console.error('[shop] checkout failed:', e);
    return json({ ok: false, reason: 'provider' }, { status: 502 });
  }
};
