import type { Handle } from '@sveltejs/kit';
import { LANG, t } from '$lib/texts';

/** The page's language and direction come from `$lib/texts.ts`, like every word. */
export const handle: Handle = ({ event, resolve }) =>
  resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%shop.lang%', LANG).replace('%shop.dir%', t.dir)
  });
