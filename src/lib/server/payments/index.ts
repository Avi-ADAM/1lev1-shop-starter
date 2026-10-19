import { env } from '$env/dynamic/private';
import { paypalAdapter } from './paypal';
import { stripeAdapter } from './stripe';
import type { PaymentAdapter } from './types';

/**
 * The payment providers this shop offers — each one whose keys are set.
 * With both, the cart shows a button for each. To add another provider,
 * write an adapter next to `stripe.ts` and add it here.
 */

export type ProviderName = 'stripe' | 'paypal';

function shippingCountries(): string[] {
  return (env.SHOP_SHIPPING_COUNTRIES ?? 'IL')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
}

function build(name: ProviderName): PaymentAdapter | null {
  if (name === 'stripe') {
    const secretKey = env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) return null;
    return stripeAdapter({
      secretKey,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim() ?? '',
      shippingCountries: shippingCountries()
    });
  }
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return paypalAdapter({
    clientId,
    clientSecret,
    webhookId: env.PAYPAL_WEBHOOK_ID?.trim() ?? '',
    environment: env.PAYPAL_ENV?.trim().toLowerCase() === 'live' ? 'live' : 'sandbox',
    shippingCountries: shippingCountries()
  });
}

const ALL: ProviderName[] = ['stripe', 'paypal'];

/** The providers whose keys are set, in the order the cart shows them. */
export function providerNames(): ProviderName[] {
  return ALL.filter((n) => build(n) !== null);
}

/** One provider by name — or, with none named, the first one set up. */
export function payments(name?: string): PaymentAdapter {
  const names = name ? ALL.filter((n) => n === name) : ALL;
  for (const n of names) {
    const adapter = build(n);
    if (adapter) return adapter;
  }
  throw new Error(
    name
      ? `Payment provider "${name}" is not set up — see .env.example`
      : 'No payment provider is set up (STRIPE_SECRET_KEY or PAYPAL_CLIENT_ID) — see .env.example'
  );
}

/** The provider a thank-you page's `/order/<id>` belongs to. */
export function paymentsFor(paymentId: string): PaymentAdapter | null {
  for (const n of ALL) {
    const adapter = build(n);
    if (adapter?.ownsPaymentId(paymentId)) return adapter;
  }
  return null;
}

/** The site's own address, for the provider's return links. */
export function siteUrlOf(requestUrl: URL): string {
  const fromEnv = env.SHOP_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return requestUrl.origin;
}
