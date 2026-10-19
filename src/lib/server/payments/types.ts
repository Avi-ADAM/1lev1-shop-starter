import type { OrderReport } from '$lib/types';
import type { DeliveryChoice, PricedLine } from '$lib/server/cart';

/**
 * A payment provider, as this shop needs it. Stripe (`stripe.ts`) and PayPal
 * (`paypal.ts`) ship; another provider is another file with these methods and
 * one line in `index.ts` — nothing else in the shop knows which is used.
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

/** The buyer came back from the provider's page (a provider that captures on return). */
export interface ReturnOutcome {
  paymentId: string | null;
  outcome: WebhookOutcome;
  /** Approved, but to a shipping country this shop does not send to — not charged. */
  shippingRefused?: boolean;
}

export interface PaymentAdapter {
  readonly name: string;
  /** Is this id (the thank-you page's `/order/<id>`) one of this provider's? */
  ownsPaymentId(paymentId: string): boolean;
  /** Where to send the buyer to pay. */
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string }>;
  /** Read the provider's server-to-server notice. Must verify its signature. */
  parseWebhook(request: Request): Promise<WebhookOutcome>;
  /** The "thank you" page's question: did this payment go through? */
  lookupPayment(paymentId: string): Promise<PaymentState>;
  /**
   * Only for a provider that charges when the buyer returns (PayPal): take
   * the money and read the order back. Stripe charges on its own page.
   */
  confirmReturn?(url: URL): Promise<ReturnOutcome>;
}
