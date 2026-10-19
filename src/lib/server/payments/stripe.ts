import type { OrderReport } from '$lib/types';
import { addressForOrder } from '$lib/address';
import type { CheckoutInput, PaymentAdapter, PaymentState, WebhookOutcome } from './types';

/**
 * Stripe Checkout, over Stripe's REST API with `fetch` — no SDK, so the same
 * code runs on Vercel, Netlify and Cloudflare.
 *
 * Each cart line becomes a Checkout line whose product carries the 1lev1 ids
 * in its metadata; the delivery fee is one more line marked `role=delivery`.
 * When Stripe says "paid", the webhook reads those lines back **from Stripe**
 * — not from anything the browser sent — and that is the order 1lev1 records.
 */

const API = 'https://api.stripe.com/v1';
/** Pinned, so a Stripe account upgrade never changes the shapes read here. */
export const STRIPE_VERSION = '2024-06-20';
/** How old a signed webhook may be — Stripe's own default. */
const TOLERANCE_SECONDS = 300;

const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
]);

export function toMinor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? Math.round(amount) : Math.round(amount * 100);
}

export function fromMinor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? amount : Math.round(amount) / 100;
}

/** Stripe's form encoding: `a[b][0][c]=v`. */
export function formEncode(value: unknown, prefix = '', out: string[] = []): string {
  if (value === undefined || value === null) return out.join('&');
  if (Array.isArray(value)) {
    value.forEach((v, i) => formEncode(v, `${prefix}[${i}]`, out));
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      formEncode(v, prefix ? `${prefix}[${k}]` : k, out);
    }
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  }
  return out.join('&');
}

/** Stripe metadata values are strings of at most 500 characters. */
function meta(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  return v.length > 500 ? v.slice(0, 500) : v;
}

export function checkoutParams(input: CheckoutInput, opts: { shippingCountries: string[] }) {
  const currency = input.currency.toLowerCase();
  const line_items: unknown[] = input.lines.map((l) => ({
    quantity: l.quantity,
    price_data: {
      currency,
      unit_amount: toMinor(l.unitPrice, input.currency),
      product_data: {
        name: l.optionLabel ? `${l.name} — ${l.optionLabel}` : l.name,
        images: l.image?.url ? [l.image.url] : undefined,
        metadata: { productId: l.productId, variantId: l.variantId ?? undefined }
      }
    }
  }));
  if (input.delivery.fee > 0) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: toMinor(input.delivery.fee, input.currency),
        product_data: { name: input.deliveryLabel, metadata: { role: 'delivery' } }
      }
    });
  }

  const base = input.siteUrl.replace(/\/+$/, '');
  return {
    mode: 'payment',
    line_items,
    success_url: `${base}/order/{CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/cart`,
    locale: input.locale === 'he' ? 'he' : 'auto',
    phone_number_collection: { enabled: true },
    // The address was taken on the cart page (it priced the delivery); Stripe
    // asks for one only when this shop has none — a rikma without zones.
    shipping_address_collection:
      input.delivery.kind === 'delivery' && !input.address
        ? { allowed_countries: opts.shippingCountries }
        : undefined,
    metadata: {
      displayNumber: input.displayNumber,
      delivery: input.delivery.kind,
      deliveryOption: input.delivery.id !== input.delivery.kind ? input.delivery.id : undefined,
      address: input.address ? meta(JSON.stringify(addressForOrder(input.address))) : undefined,
      note: meta(input.note),
      locale: input.locale
    },
    payment_intent_data: { metadata: { displayNumber: input.displayNumber } }
  };
}

// ─── the webhook ───────────────────────────────────────────────────────────

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * `Stripe-Signature: t=…,v1=…` — HMAC-SHA256 of `"<t>.<raw body>"` with the
 * endpoint's secret. Checked against the raw bytes: a parsed-and-reserialized
 * body would not match.
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  if (!header || !secret) return false;
  let t: string | null = null;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2).map((s) => s?.trim());
    if (k === 't') t = v ?? null;
    else if (k === 'v1' && v) v1.push(v);
  }
  if (!t || !/^\d+$/.test(t) || v1.length === 0) return false;
  if (Math.abs(nowSeconds - Number(t)) > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`)));
  return v1.some((sig) => safeEqual(sig, expected));
}

const DELIVERY_KINDS = ['pickup', 'delivery', 'digital', 'contact'] as const;

/** The address this shop wrote into the session's metadata — strings only, never trusted further. */
export function parseAddress(raw: unknown): Record<string, string> | null {
  if (typeof raw !== 'string' || !raw.startsWith('{')) return null;
  try {
    const v = JSON.parse(raw);
    const out: Record<string, string> = {};
    for (const [k, x] of Object.entries(v ?? {})) if (typeof x === 'string' && x) out[k.slice(0, 20)] = x.slice(0, 200);
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** The id 1lev1 records the order under: the payment, else the session. */
export function externalIdOf(session: any): string {
  const pi = session?.payment_intent;
  if (typeof pi === 'string' && pi) return pi;
  if (pi && typeof pi === 'object' && pi.id) return String(pi.id);
  return String(session?.id ?? '');
}

/**
 * A paid Checkout Session + its line items ⇒ the body of `POST /orders`.
 * Pure: every value comes from what Stripe returned.
 */
export function orderFromSession(session: any, lineItems: any[]): OrderReport {
  const currency = String(session?.currency ?? '').toUpperCase();
  const lines: OrderReport['lines'] = [];
  let fee = 0;
  for (const li of lineItems) {
    const product = li?.price?.product;
    const md = (product && typeof product === 'object' ? product.metadata : null) ?? {};
    const unit = fromMinor(Number(li?.price?.unit_amount ?? 0), currency);
    const quantity = Number(li?.quantity ?? 0);
    if (md.role === 'delivery') {
      fee += unit * quantity;
      continue;
    }
    if (!md.productId) continue; // not a line this shop created
    lines.push({
      productId: String(md.productId),
      ...(md.variantId ? { variantId: String(md.variantId) } : {}),
      quantity,
      unitPrice: unit
    });
  }

  const m = session?.metadata ?? {};
  const kind = (DELIVERY_KINDS as readonly string[]).includes(m.delivery) ? m.delivery : 'contact';
  const details = session?.customer_details ?? {};
  const shipping = session?.shipping_details ?? session?.collected_information?.shipping_details ?? null;
  const addr = shipping?.address ?? null;
  const address: Record<string, string> = {};
  const ours = parseAddress(m.address);
  if (ours) Object.assign(address, ours);
  else if (addr) {
    if (shipping?.name) address.name = String(shipping.name);
    for (const [k, v] of Object.entries({
      street: [addr.line1, addr.line2].filter(Boolean).join(', '),
      city: addr.city,
      zip: addr.postal_code,
      state: addr.state,
      country: addr.country
    })) {
      if (v) address[k] = String(v);
    }
  }

  const buyer: NonNullable<OrderReport['buyer']> = {};
  if (details.name) buyer.name = String(details.name);
  if (details.email) buyer.email = String(details.email);
  if (details.phone) buyer.phone = String(details.phone);

  const externalId = externalIdOf(session);
  const order: OrderReport = {
    externalId,
    paymentRef: externalId,
    paymentMethod: String(session?.payment_method_types?.[0] ?? 'card'),
    amount: fromMinor(Number(session?.amount_total ?? 0), currency),
    currency,
    buyer,
    delivery: {
      preference: kind,
      ...(Object.keys(address).length ? { address } : {}),
      ...(fee > 0 ? { fee: Math.round(fee * 100) / 100 } : {}),
      ...(typeof m.deliveryOption === 'string' && m.deliveryOption ? { optionId: m.deliveryOption } : {})
    },
    lines
  };
  if (m.displayNumber) order.displayNumber = String(m.displayNumber);
  if (m.note) order.note = String(m.note);
  if (m.locale) order.locale = String(m.locale);
  return order;
}

// ─── the adapter ───────────────────────────────────────────────────────────

export function stripeAdapter(cfg: {
  secretKey: string;
  webhookSecret: string;
  shippingCountries: string[];
  fetch?: typeof fetch;
}): PaymentAdapter {
  const doFetch = cfg.fetch ?? fetch;

  async function stripe(path: string, init: { method?: string; body?: string } = {}) {
    const res = await doFetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${cfg.secretKey}`,
        'Stripe-Version': STRIPE_VERSION,
        ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
      },
      body: init.body
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`Stripe ${res.status}: ${json?.error?.message ?? res.statusText}`);
    }
    return json;
  }

  return {
    name: 'stripe',

    ownsPaymentId: (id) => /^cs_[A-Za-z0-9_]+$/.test(id),

    async createCheckout(input) {
      const session = await stripe('/checkout/sessions', {
        method: 'POST',
        body: formEncode(checkoutParams(input, { shippingCountries: cfg.shippingCountries }))
      });
      if (!session?.url) throw new Error('Stripe returned no checkout URL');
      return { redirectUrl: String(session.url) };
    },

    async parseWebhook(request): Promise<WebhookOutcome> {
      const raw = await request.text();
      const ok = await verifyStripeSignature(raw, request.headers.get('stripe-signature'), cfg.webhookSecret);
      if (!ok) return { kind: 'invalid', reason: 'bad or missing Stripe-Signature' };

      let event: any;
      try {
        event = JSON.parse(raw);
      } catch {
        return { kind: 'invalid', reason: 'body is not JSON' };
      }
      const type = String(event?.type ?? '');
      const session = event?.data?.object;
      // `completed` arrives also for a bank transfer still on its way; that one
      // is reported by `async_payment_succeeded`, when the money is there.
      const paid =
        (type === 'checkout.session.completed' && session?.payment_status === 'paid') ||
        type === 'checkout.session.async_payment_succeeded';
      if (!paid || !session?.id) return { kind: 'ignored', reason: `${type} (${session?.payment_status ?? '-'})` };

      const items = await stripe(
        `/checkout/sessions/${encodeURIComponent(session.id)}/line_items?limit=100&expand[]=data.price.product`
      );
      return { kind: 'paid', order: orderFromSession(session, items?.data ?? []) };
    },

    async lookupPayment(sessionId): Promise<PaymentState> {
      if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { state: 'unknown', externalId: null };
      let session: any;
      try {
        session = await stripe(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
      } catch {
        return { state: 'unknown', externalId: null };
      }
      const state =
        session?.payment_status === 'paid' || session?.payment_status === 'no_payment_required'
          ? 'paid'
          : session?.status === 'complete'
            ? 'pending'
            : 'unpaid';
      return { state, externalId: externalIdOf(session) || null };
    }
  };
}
