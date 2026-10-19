import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProduct, levConfig } from '$lib/server/lev';
import { priceCart } from '$lib/server/cart';
import { payments, providerNames, siteUrlOf } from '$lib/server/payments';
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
  const offered = providerNames();
  const provider = typeof body?.provider === 'string' ? body.provider : offered[0];
  if (!provider || !(offered as string[]).includes(provider)) {
    return json({ ok: false, reason: 'provider' }, { status: 400 });
  }
  const cfg = levConfig();
  const priced = await priceCart(body?.items, (id) => getProduct(cfg, id));

  const seen = Number(body?.expectedSubtotal);
  const moved = priced.problems.length > 0 || (Number.isFinite(seen) && seen !== priced.subtotal);
  if (moved || priced.lines.length === 0) {
    return json({ ok: false, reason: 'changed', cart: priced }, { status: 409 });
  }
  // Not the buyer's doing, and nothing they can fix by reviewing the cart:
  // the catalog sent prices without a currency.
  if (!priced.currency) {
    console.error('[shop] checkout refused: the catalog gave these products no currency');
    return json({ ok: false, reason: 'currency' }, { status: 502 });
  }

  const delivery = priced.delivery.find((d) => d.kind === body?.delivery) ?? priced.delivery[0];
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) || null : null;

  try {
    const { redirectUrl } = await payments(provider).createCheckout({
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
