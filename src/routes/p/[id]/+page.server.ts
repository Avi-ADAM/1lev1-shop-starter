import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getProduct, levConfig } from '$lib/server/lev';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
  const product = await getProduct(levConfig(), params.id);
  if (!product || product.status !== 'published') error(404, 'Not found');
  setHeaders({ 'cache-control': 'public, max-age=30, stale-while-revalidate=300' });
  return { product };
};
