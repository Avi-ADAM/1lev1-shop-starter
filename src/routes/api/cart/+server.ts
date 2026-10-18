import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProduct, levConfig } from '$lib/server/lev';
import { priceCart } from '$lib/server/cart';

/** The cart page asks here what the cart costs right now. */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const cfg = levConfig();
  return json(await priceCart(body?.items, (id) => getProduct(cfg, id)));
};
