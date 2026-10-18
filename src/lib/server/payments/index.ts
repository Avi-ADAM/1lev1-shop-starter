import { env } from '$env/dynamic/private';
import { stripeAdapter } from './stripe';
import type { PaymentAdapter } from './types';

/**
 * The payment provider this shop uses. To add another, write an adapter next
 * to `stripe.ts` and choose it here — by an env var if both should stay.
 */
export function payments(): PaymentAdapter {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set — see .env.example');
  return stripeAdapter({
    secretKey,
    webhookSecret: webhookSecret ?? '',
    shippingCountries: (env.SHOP_SHIPPING_COUNTRIES ?? 'IL')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c))
  });
}

/** The site's own address, for the provider's return links. */
export function siteUrlOf(requestUrl: URL): string {
  const fromEnv = env.SHOP_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return requestUrl.origin;
}
