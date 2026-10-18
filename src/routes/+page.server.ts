import type { PageServerLoad } from './$types';
import { levConfig, listCategories, listOptions, listProducts, LevError } from '$lib/server/lev';
import type { ProductList } from '$lib/types';

export const load: PageServerLoad = async ({ url, setHeaders }) => {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const category = url.searchParams.get('category') ?? '';
  const q = (url.searchParams.get('q') ?? '').trim();
  const options: Record<string, string> = {};
  for (const [k, v] of url.searchParams) {
    if (k.startsWith('option.') && v) options[k.slice('option.'.length)] = v;
  }

  let cfg;
  try {
    cfg = levConfig();
  } catch {
    return { list: null, categories: [], axes: [], filters: { page, category, q, options } };
  }

  const [list, categories, axes] = await Promise.all([
    listProducts(cfg, { page, category: category || undefined, q: q || undefined, options }).catch(
      (e): ProductList | null => {
        // A filter the API refuses (an axis that no longer exists) is an empty
        // page, not a broken one.
        if (e instanceof LevError && e.status === 400) return null;
        throw e;
      }
    ),
    listCategories(cfg).catch(() => []),
    listOptions(cfg).catch(() => [])
  ]);

  setHeaders({ 'cache-control': 'public, max-age=30, stale-while-revalidate=300' });
  return { list, categories, axes, filters: { page, category, q, options } };
};
