import type { LayoutServerLoad } from './$types';
import { rikmaOf } from '$lib/server/shop';

export const load: LayoutServerLoad = async () => {
  try {
    const rikma = await rikmaOf();
    return { rikma: { id: rikma.id, name: rikma.name, url: rikma.url }, setupError: null };
  } catch (e) {
    // The shop still renders — with the reason, so the owner sees what to fix.
    console.error('[shop] rikma lookup failed:', e);
    return { rikma: null, setupError: (e as Error).message };
  }
};
