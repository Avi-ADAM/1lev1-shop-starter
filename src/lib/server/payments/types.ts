import type { OrderReport } from '$lib/types';
import type { DeliveryChoice, PricedLine } from '$lib/server/cart';

/**
 * A payment provider, as this shop needs it. Stripe is the one that ships
 * (`stripe.ts`); another provider is another file with these three methods
 * and one line in `index.ts` — nothing else in the shop knows which is used.
 */

export interface CheckoutInput {
  lines: PricedLine[];
  currency: string;
  delivery: DeliveryChoice;
  /** What the delivery fee line is called on the payment page. */
  deliveryLabel: string;
  /** The number the buyer is told — also how the rikma finds the order. */
  displayNumber: string;
  note: string | null;
  locale: string;
  siteUrl: string;
}

export type WebhookOutcome =
  /** A confirmed payment, already shaped as the order 1lev1 records. */
  | { kind: 'paid'; order: OrderReport }
  /** Signed and genuine, but not an event that means "paid". */
  | { kind: 'ignored'; reason: string }
  /** Not from the provider. Answer 400 and record nothing. */
  | { kind: 'invalid'; reason: string };

export interface PaymentState {
  state: 'paid' | 'pending' | 'unpaid' | 'unknown';
  /** The id the order is reported under — `externalId` at 1lev1. */
  externalId: string | null;
}

export interface PaymentAdapter {
  readonly name: string;
  /** Where to send the buyer to pay. */
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string }>;
  /** Read the provider's server-to-server notice. Must verify its signature. */
  parseWebhook(request: Request): Promise<WebhookOutcome>;
  /** The "thank you" page's question: did this payment go through? */
  lookupPayment(paymentId: string): Promise<PaymentState>;
}
