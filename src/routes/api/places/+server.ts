import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { levConfig, listLocalities, listStreets } from '$lib/server/lev';
import type { Locality } from '$lib/types';

/**
 * Israel's localities (`/api/places`) and one locality's streets
 * (`/api/places?city=<code>`), from 1lev1's copy of the CBS lists — so the
 * address form completes real names and the city matches the rikma's zones.
 *
 * Kept here for a day, per server instance: the browser filters the list
 * itself, so typing costs no call at all.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
let cities: { at: number; list: Locality[] } | null = null;
const streets = new Map<string, { at: number; list: string[] }>();

// A failure is not cached: the next visitor asks 1lev1 again. (SvelteKit
// refuses to set one header twice, so each answer carries its own.)
const CACHED = { headers: { 'cache-control': 'public, max-age=86400' } };
const UNCACHED = { headers: { 'cache-control': 'no-store' } };

export const GET: RequestHandler = async ({ url }) => {
  const cfg = levConfig();
  const city = url.searchParams.get('city') ?? '';
  try {
    if (city) {
      if (!/^\d{1,6}$/.test(city)) return json({ streets: [] }, { status: 400, ...UNCACHED });
      const hit = streets.get(city);
      if (hit && Date.now() - hit.at < DAY_MS) return json({ streets: hit.list }, CACHED);
      const list = await listStreets(cfg, city);
      if (streets.size > 200) streets.clear();
      streets.set(city, { at: Date.now(), list });
      return json({ streets: list }, CACHED);
    }
    if (!cities || Date.now() - cities.at > DAY_MS || cities.list.length === 0) {
      cities = { at: Date.now(), list: await listLocalities(cfg) };
    }
    return json({ cities: cities.list }, CACHED);
  } catch (e) {
    // The form still works by hand; only the suggestions are missing.
    console.warn('[shop] places unavailable:', e);
    return json(city ? { streets: [] } : { cities: [] }, UNCACHED);
  }
};
