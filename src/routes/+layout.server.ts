import type { LayoutServerLoad } from './$types';
import { promotionsOf, rikmaOf } from '$lib/server/shop';
import { runningPromotions } from '$lib/promo';

export const load: LayoutServerLoad = async () => {
  try {
    // `promotionsOf` never throws: no promotions is no banner, not a broken shop.
    const [rikma, promotions] = await Promise.all([rikmaOf(), promotionsOf()]);
    return {
      rikma: { id: rikma.id, name: rikma.name, url: rikma.url, currency: rikma.currency },
      promotions: runningPromotions(promotions),
      setupError: null
    };
  } catch (e) {
    // The shop still renders — with the reason, so the owner sees what to fix.
    console.error('[shop] rikma lookup failed:', e);
    return { rikma: null, promotions: [], setupError: (e as Error).message };
  }
};
