import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProduct, levConfig } from '$lib/server/lev';
import { priceCart } from '$lib/server/cart';
import { deliveryFor } from '$lib/server/delivery';
import { cleanAddress } from '$lib/address';

/**
 * The cart page asks here what the cart costs right now — and, with the
 * buyer's address, how it can reach them and for how much (1lev1's quote).
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const cfg = levConfig();
  const priced = await priceCart(body?.items, (id) => getProduct(cfg, id));
  const address = body?.address ? cleanAddress(body.address) : null;
  try {
    const state = await deliveryFor(cfg, priced, address);
    return json({ ...priced, delivery: state.choices, shipping: state });
  } catch (e) {
    // The cart still prices without a delivery quote; the buyer can still order.
    console.error('[shop] shipping quote failed:', e);
    return json({ ...priced, shipping: { zones: false, choices: priced.delivery, needsAddress: false, outsideZones: false, zone: null } });
  }
};
