import type { OrderReport } from '$lib/types';
import { streetLine, type BuyerAddress } from '$lib/address';
import type { CheckoutInput, PaymentAdapter, PaymentState, ReturnOutcome, WebhookOutcome } from './types';

/**
 * PayPal Checkout (Orders v2), over PayPal's REST API with `fetch` — no SDK,
 * so the same code runs on Vercel, Netlify and Cloudflare.
 *
 * The buyer is sent to PayPal's approval page; PayPal sends them back to
 * `/api/payments/paypal/return`, where the server captures the money. Unlike
 * Stripe, nothing is charged until that capture — so the return is where the
 * order is reported, and the webhook is the safety net for a buyer who closed
 * the tab before coming back.
 *
 * Each cart line becomes a PayPal item whose `sku` carries the 1lev1 ids; the
 * delivery fee is the order's `shipping` amount. The order 1lev1 records is
 * always read back **from PayPal** — never from what the browser or the
 * webhook body said.
 */

export const PAYPAL_APIS = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com'
} as const;

/** Currencies PayPal takes without decimals. */
const ZERO_DECIMAL = new Set(['HUF', 'JPY', 'TWD']);

function decimalsOf(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

/** An amount in the currency's smallest unit — sums stay exact. */
export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** decimalsOf(currency));
}

/** PayPal's money: a string with exactly the currency's decimals. */
export function moneyValue(minor: number, currency: string): string {
  const d = decimalsOf(currency);
  return (minor / 10 ** d).toFixed(d);
}

function cut(v: string, max: number): string {
  return v.length > max ? v.slice(0, max) : v;
}

/** `productId` or `productId|variantId` — PayPal gives it back on the order. */
export function skuOf(productId: string, variantId: string | null): string {
  return cut(variantId ? `${productId}|${variantId}` : productId, 127);
}

export function idsOfSku(sku: unknown): { productId: string; variantId?: string } | null {
  if (typeof sku !== 'string' || !sku) return null;
  const [productId, variantId] = sku.split('|', 2);
  if (!productId) return null;
  return variantId ? { productId, variantId } : { productId };
}

/** Apartment, floor and entrance ride on the second address line. */
export function shippingOf(a: BuyerAddress) {
  const line2 = [a.apartment && `apt ${a.apartment}`, a.floor && `floor ${a.floor}`, a.entrance && `entrance ${a.entrance}`]
    .filter(Boolean)
    .join(', ');
  return {
    address: {
      address_line_1: cut(streetLine(a), 300),
      ...(line2 ? { address_line_2: cut(line2, 300) } : {}),
      admin_area_2: cut(a.city, 120),
      ...(a.zip ? { postal_code: cut(a.zip, 60) } : {}),
      country_code: a.country || 'IL'
    }
  };
}

export function orderParams(input: CheckoutInput) {
  const currency = input.currency.toUpperCase();
  const items = input.lines.map((l) => ({
    name: cut(l.optionLabel ? `${l.name} — ${l.optionLabel}` : l.name, 127),
    quantity: String(l.quantity),
    unit_amount: { currency_code: currency, value: moneyValue(toMinor(l.unitPrice, currency), currency) },
    sku: skuOf(l.productId, l.variantId),
    ...(l.image?.url?.startsWith('https://') ? { image_url: cut(l.image.url, 2048) } : {})
  }));
  const itemTotal = input.lines.reduce((s, l) => s + toMinor(l.unitPrice, currency) * l.quantity, 0);
  const shipping = input.delivery.fee > 0 ? toMinor(input.delivery.fee, currency) : 0;

  const base = input.siteUrl.replace(/\/+$/, '');
  return {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: 'shop',
        // Shown to the buyer and the seller in PayPal; also how the rikma
        // finds the order.
        invoice_id: input.displayNumber,
        // `delivery|locale|option` — read back when the order is reported
        // (PayPal keeps 127 characters; an option id is at most 84).
        custom_id: cut(
          `${input.delivery.kind}|${input.locale}${input.delivery.id !== input.delivery.kind ? `|${input.delivery.id}` : ''}`,
          127
        ),
        // The address the cart page took (it priced the delivery) — PayPal
        // shows it instead of asking for one, and hands it back with the order.
        ...(input.address && input.delivery.kind === 'delivery' ? { shipping: shippingOf(input.address) } : {}),
        // PayPal keeps 127 characters; the note is the buyer's own words.
        ...(input.note ? { description: cut(input.note, 127) } : {}),
        items,
        amount: {
          currency_code: currency,
          value: moneyValue(itemTotal + shipping, currency),
          breakdown: {
            item_total: { currency_code: currency, value: moneyValue(itemTotal, currency) },
            ...(shipping > 0 ? { shipping: { currency_code: currency, value: moneyValue(shipping, currency) } } : {})
          }
        }
      }
    ],
    payment_source: {
      paypal: {
        experience_context: {
          ...(input.locale === 'he' ? { locale: 'he-IL' } : {}),
          shipping_preference:
            input.delivery.kind !== 'delivery' ? 'NO_SHIPPING' : input.address ? 'SET_PROVIDED_ADDRESS' : 'GET_FROM_FILE',
          user_action: 'PAY_NOW',
          return_url: `${base}/api/payments/paypal/return`,
          cancel_url: `${base}/cart`
        }
      }
    }
  };
}

const DELIVERY_KINDS = ['pickup', 'delivery', 'digital', 'contact'] as const;

function unitOf(order: any): any {
  return order?.purchase_units?.[0] ?? {};
}

function captureOf(order: any): any {
  const captures: any[] = unitOf(order)?.payments?.captures ?? [];
  return captures.find((c) => c?.status === 'COMPLETED') ?? captures[0] ?? null;
}

/** Where the money is: `paid` only once a capture has completed. */
export function stateOfOrder(order: any): PaymentState['state'] {
  const capture = captureOf(order);
  if (order?.status === 'COMPLETED' && capture?.status === 'COMPLETED') return 'paid';
  if (capture?.status === 'PENDING' || order?.status === 'APPROVED') return 'pending';
  return 'unpaid';
}

/**
 * A captured PayPal order ⇒ the body of `POST /orders`.
 * Pure: every value comes from what PayPal returned.
 */
export function orderFromPaypal(order: any): OrderReport {
  const pu = unitOf(order);
  const currency = String(pu?.amount?.currency_code ?? '').toUpperCase();
  const lines: OrderReport['lines'] = [];
  for (const item of pu?.items ?? []) {
    const ids = idsOfSku(item?.sku);
    if (!ids) continue; // not a line this shop created
    lines.push({
      ...ids,
      quantity: Number(item?.quantity ?? 0),
      unitPrice: Number(item?.unit_amount?.value ?? 0)
    });
  }
  const fee = Number(pu?.amount?.breakdown?.shipping?.value ?? 0);

  const [kindRaw, locale, optionId] = String(pu?.custom_id ?? '').split('|', 3);
  const kind = (DELIVERY_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as (typeof DELIVERY_KINDS)[number])
    : 'contact';

  const addr = pu?.shipping?.address ?? null;
  const address: Record<string, string> = {};
  if (addr) {
    if (pu?.shipping?.name?.full_name) address.name = String(pu.shipping.name.full_name);
    for (const [k, v] of Object.entries({
      street: addr.address_line_1,
      notes: addr.address_line_2,
      city: addr.admin_area_2,
      zip: addr.postal_code,
      state: addr.admin_area_1,
      country: addr.country_code
    })) {
      if (v) address[k] = String(v);
    }
  }

  const payer = order?.payer ?? order?.payment_source?.paypal ?? {};
  const buyer: NonNullable<OrderReport['buyer']> = {};
  const name = [payer?.name?.given_name, payer?.name?.surname].filter(Boolean).join(' ');
  if (name) buyer.name = name;
  if (payer?.email_address) buyer.email = String(payer.email_address);
  const phone = payer?.phone?.phone_number?.national_number ?? payer?.phone_number?.national_number;
  if (phone) buyer.phone = String(phone);

  const capture = captureOf(order);
  const out: OrderReport = {
    externalId: String(order?.id ?? ''),
    paymentRef: String(capture?.id ?? order?.id ?? ''),
    paymentMethod: 'paypal',
    amount: Number(capture?.amount?.value ?? pu?.amount?.value ?? 0),
    currency,
    buyer,
    delivery: {
      preference: kind,
      ...(Object.keys(address).length ? { address } : {}),
      ...(fee > 0 ? { fee } : {}),
      ...(optionId ? { optionId } : {})
    },
    lines
  };
  if (pu?.invoice_id) out.displayNumber = String(pu.invoice_id);
  if (pu?.description) out.note = String(pu.description);
  if (locale) out.locale = locale;
  return out;
}

/** PayPal order ids: 17 upper-case letters and digits, give or take. */
const ORDER_ID = /^[A-Z0-9]{8,36}$/;

// ─── the adapter ───────────────────────────────────────────────────────────

export function paypalAdapter(cfg: {
  clientId: string;
  clientSecret: string;
  /** From the webhook you add in PayPal — needed to verify its notices. */
  webhookId: string;
  environment: keyof typeof PAYPAL_APIS;
  shippingCountries: string[];
  fetch?: typeof fetch;
}): PaymentAdapter {
  const doFetch = cfg.fetch ?? fetch;
  const api = PAYPAL_APIS[cfg.environment];
  let token: { value: string; until: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.until > Date.now()) return token.value;
    const res = await doFetch(`${api}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      throw new Error(`PayPal ${res.status}: ${json?.error_description ?? 'no access token'}`);
    }
    // A minute early, so a token never expires mid-call.
    token = { value: String(json.access_token), until: Date.now() + (Number(json.expires_in ?? 0) - 60) * 1000 };
    return token.value;
  }

  async function paypal(
    path: string,
    init: { method?: string; body?: string; headers?: Record<string, string> } = {}
  ): Promise<{ status: number; json: any }> {
    const res = await doFetch(`${api}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers
      },
      body: init.body
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  function fail(status: number, json: any): never {
    throw new Error(`PayPal ${status}: ${json?.details?.[0]?.issue ?? json?.name ?? ''} ${json?.message ?? ''}`.trim());
  }

  async function getOrder(id: string): Promise<any> {
    const { status, json } = await paypal(`/v2/checkout/orders/${encodeURIComponent(id)}`);
    if (status >= 300) fail(status, json);
    return json;
  }

  function shippingAllowed(order: any): boolean {
    const pu = unitOf(order);
    const [kind, , optionId] = String(pu?.custom_id ?? '').split('|', 3);
    if (kind !== 'delivery') return true;
    // An option the rikma's zones priced was already checked against the address.
    if (optionId) return true;
    const country = String(pu?.shipping?.address?.country_code ?? '').toUpperCase();
    return cfg.shippingCountries.includes(country);
  }

  /**
   * Take the money for an approved order, once. The same `PayPal-Request-Id`
   * makes a second capture (the return and the webhook racing) answer with
   * the first one's result instead of failing.
   */
  async function settle(id: string): Promise<{ order: any; shippingRefused: boolean }> {
    let order = await getOrder(id);
    if (order?.status !== 'APPROVED') return { order, shippingRefused: false };
    if (!shippingAllowed(order)) return { order, shippingRefused: true };

    const { status, json } = await paypal(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {
      method: 'POST',
      body: '{}',
      headers: { 'PayPal-Request-Id': `capture-${id}`, Prefer: 'return=representation' }
    });
    if (status < 300) order = json;
    else if (json?.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') order = await getOrder(id);
    else fail(status, json);
    return { order, shippingRefused: false };
  }

  function outcomeOf(order: any): WebhookOutcome {
    if (stateOfOrder(order) !== 'paid') return { kind: 'ignored', reason: `order ${order?.status ?? '-'}` };
    return { kind: 'paid', order: orderFromPaypal(order) };
  }

  /**
   * PayPal signs with a certificate; the simplest check that runs everywhere
   * is to ask PayPal. The event is passed on as the raw bytes it arrived as —
   * re-serializing it could change it and fail the check.
   */
  async function verify(request: Request, raw: string): Promise<boolean> {
    if (!cfg.webhookId) return false;
    const h = (name: string) => request.headers.get(name) ?? '';
    const head = JSON.stringify({
      auth_algo: h('paypal-auth-algo'),
      cert_url: h('paypal-cert-url'),
      transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'),
      transmission_time: h('paypal-transmission-time'),
      webhook_id: cfg.webhookId
    });
    const { status, json } = await paypal('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: `${head.slice(0, -1)},"webhook_event":${raw}}`
    });
    return status < 300 && json?.verification_status === 'SUCCESS';
  }

  return {
    name: 'paypal',

    ownsPaymentId: (id) => ORDER_ID.test(id),

    async createCheckout(input) {
      const { status, json } = await paypal('/v2/checkout/orders', {
        method: 'POST',
        body: JSON.stringify(orderParams(input)),
        headers: { 'PayPal-Request-Id': `order-${input.displayNumber}` }
      });
      if (status >= 300) fail(status, json);
      const link = (json?.links ?? []).find((l: any) => l?.rel === 'payer-action' || l?.rel === 'approve');
      if (!link?.href) throw new Error('PayPal returned no approval link');
      return { redirectUrl: String(link.href) };
    },

    async confirmReturn(url): Promise<ReturnOutcome> {
      const id = url.searchParams.get('token') ?? '';
      if (!ORDER_ID.test(id)) return { paymentId: null, outcome: { kind: 'invalid', reason: 'no PayPal order' } };
      const { order, shippingRefused } = await settle(id);
      return { paymentId: id, outcome: outcomeOf(order), shippingRefused };
    },

    async parseWebhook(request): Promise<WebhookOutcome> {
      const raw = await request.text();
      let event: any;
      try {
        event = JSON.parse(raw);
      } catch {
        return { kind: 'invalid', reason: 'body is not JSON' };
      }
      if (!(await verify(request, raw).catch(() => false))) {
        return { kind: 'invalid', reason: 'PayPal did not confirm this notice (check PAYPAL_WEBHOOK_ID)' };
      }

      const type = String(event?.event_type ?? '');
      const resource = event?.resource ?? {};
      // Approved but never captured — the buyer closed the tab on the way back.
      // Completed — the capture this shop made, or a pending one that cleared.
      const id =
        type === 'CHECKOUT.ORDER.APPROVED'
          ? resource.id
          : type === 'PAYMENT.CAPTURE.COMPLETED'
            ? resource?.supplementary_data?.related_ids?.order_id
            : null;
      if (!id || !ORDER_ID.test(String(id))) return { kind: 'ignored', reason: type || '-' };

      const { order, shippingRefused } = await settle(String(id));
      if (shippingRefused) return { kind: 'ignored', reason: 'shipping country not served' };
      return outcomeOf(order);
    },

    async lookupPayment(id): Promise<PaymentState> {
      if (!ORDER_ID.test(id)) return { state: 'unknown', externalId: null };
      try {
        const order = await getOrder(id);
        return { state: stateOfOrder(order), externalId: String(order?.id ?? id) };
      } catch {
        return { state: 'unknown', externalId: null };
      }
    }
  };
}
