import type { PageServerLoad } from './$types';
import { providerNames } from '$lib/server/payments';

/** Which payment buttons to show — one per provider whose keys are set. */
export const load: PageServerLoad = () => ({ providers: providerNames() });
