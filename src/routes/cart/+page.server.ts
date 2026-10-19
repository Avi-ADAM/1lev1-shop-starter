import type { PageServerLoad } from './$types';
import { providerNames } from '$lib/server/payments';
import { arrangedChannels } from '$lib/server/arranged';
import { shippingOf } from '$lib/server/shop';

/**
 * Which payment buttons to show — one per provider whose keys are set, and
 * "order now, pay by arrangement" when `ARRANGED_PAYMENT` is on. Either may
 * be missing; a shop with neither says so instead of offering a dead button.
 */
export const load: PageServerLoad = async () => ({
  providers: providerNames(),
  arranged: arrangedChannels().length > 0,
  // The rikma's zones (for the country list) and pickup points, when it set shipping up.
  shipping: await shippingOf()
});
