import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProduct, levConfig, LevError, reportOrder } from '$lib/server/lev';
import { priceCart } from '$lib/server/cart';
import { checkoutDelivery } from '$lib/server/delivery';
import { newDisplayNumber } from '$lib/server/shop';
import {
  arrangedChannels,
  arrangedExpiryHours,
  arrangedReport,
  checkBuyer,
  newArrangedId,
  rateLimiter
} from '$lib/server/arranged';
import { LANG } from '$lib/texts';

const allow = rateLimiter();

/**
 * "Order now, pay by arrangement" (see `$lib/server/arranged.ts`). Priced
 * again from the catalog, exactly as the checkout does — a buyer who sees a
 * changed cart gets it back to review. Reported to 1lev1 from here, with the
 * orders key that never leaves the server; the buyer is sent to the
 * thank-you page, which says the shop will be in touch.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  if (arrangedChannels().length === 0) return json({ ok: false, reason: 'off' }, { status: 404 });

  let ip = 'unknown';
  try {
    ip = getClientAddress();
  } catch {
    /* some adapters cannot tell — then everyone shares one budget */
  }
  if (!allow(ip)) return json({ ok: false, reason: 'tooMany' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
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
    console.error('[shop] arranged order refused: the catalog gave these products no currency');
    return json({ ok: false, reason: 'currency' }, { status: 502 });
  }
  const check = checkBuyer(body?.buyer);
  if (check.ok === false) {
    // A bot that filled the hidden field learns nothing from the answer.
    if (check.reason === 'spam') return json({ ok: false, reason: 'invalid', fields: [] }, { status: 400 });
    return json({ ok: false, reason: 'invalid', fields: check.fields }, { status: 400 });
  }

  let gate;
  try {
    gate = await checkoutDelivery(cfg, priced, body ?? {});
  } catch (e) {
    console.error('[shop] arranged order refused: the delivery could not be quoted:', e);
    return json({ ok: false, reason: 'record' }, { status: 502 });
  }
  if (gate.ok === false) {
    const cart = { ...priced, delivery: gate.state.choices, shipping: gate.state };
    if (gate.reason === 'address') {
      return json({ ok: false, reason: 'invalid', fields: gate.fields ?? [], cart }, { status: 400 });
    }
    return json({ ok: false, reason: 'changed', cart }, { status: 409 });
  }
  const { choice: delivery, address } = gate;

  const externalId = newArrangedId();
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) || null : null;
  try {
    const res = await reportOrder(
      cfg,
      arrangedReport({
        externalId,
        displayNumber: newDisplayNumber(),
        priced,
        delivery,
        address,
        buyer: check.buyer,
        note,
        locale: LANG,
        expiresInHours: arrangedExpiryHours()
      })
    );
    console.log(`[shop] arranged order ${res.orderRef} recorded — awaiting payment`);
    return json({ ok: true, redirectUrl: `/order/${externalId}` });
  } catch (e) {
    const err = e instanceof LevError ? e : new LevError(0, 'UNKNOWN', String(e));
    console.error(`[shop] arranged order not recorded status=${err.status} code=${err.code}: ${err.message}`, err.details ?? '');
    return json({ ok: false, reason: 'record' }, { status: 502 });
  }
};
