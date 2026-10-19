import type { PageServerLoad } from './$types';
import { providerNames } from '$lib/server/payments';
import { arrangedChannels } from '$lib/server/arranged';

/**
 * Which payment buttons to show — one per provider whose keys are set, and
 * "order now, pay by arrangement" when `ARRANGED_PAYMENT` is on. Either may
 * be missing; a shop with neither says so instead of offering a dead button.
 */
export const load: PageServerLoad = () => ({
  providers: providerNames(),
  arranged: arrangedChannels().length > 0
});
