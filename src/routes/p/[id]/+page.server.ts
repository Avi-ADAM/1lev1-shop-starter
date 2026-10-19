import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getProduct, levConfig } from '$lib/server/lev';
import { shippingOf } from '$lib/server/shop';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
  const cfg = levConfig();
  const [product, shipping] = await Promise.all([getProduct(cfg, params.id), shippingOf(cfg)]);
  if (!product || product.status !== 'published') error(404, 'Not found');
  setHeaders({ 'cache-control': 'public, max-age=30, stale-while-revalidate=300' });
  return { product, shipping };
};
