import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  checkoutParams,
  formEncode,
  fromMinor,
  orderFromSession,
  stripeAdapter,
  toMinor,
  verifyStripeSignature
} from './stripe';

const SECRET = 'whsec_test';

function sign(body: string, t: number, secret = SECRET) {
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('Stripe-Signature', () => {
  const body = '{"id":"evt_1"}';
  const now = 1_760_000_000;

  it('accepts a fresh, correct signature', async () => {
    expect(await verifyStripeSignature(body, sign(body, now), SECRET, now)).toBe(true);
  });

  it('accepts when any one v1 matches (secret rotation)', async () => {
    const header = `t=${now},v1=deadbeef,${sign(body, now).split(',')[1]}`;
    expect(await verifyStripeSignature(body, header, SECRET, now)).toBe(true);
  });

  it('refuses a changed body, another secret, an old timestamp, or no header', async () => {
    expect(await verifyStripeSignature(body + ' ', sign(body, now), SECRET, now)).toBe(false);
    expect(await verifyStripeSignature(body, sign(body, now, 'whsec_other'), SECRET, now)).toBe(false);
    expect(await verifyStripeSignature(body, sign(body, now - 301), SECRET, now)).toBe(false);
    expect(await verifyStripeSignature(body, null, SECRET, now)).toBe(false);
    expect(await verifyStripeSignature(body, sign(body, now), '', now)).toBe(false);
  });
});

describe('money in minor units', () => {
  it('handles two-decimal and zero-decimal currencies', () => {
    expect(toMinor(19.9, 'ILS')).toBe(1990);
    expect(fromMinor(1990, 'ILS')).toBe(19.9);
    expect(toMinor(500, 'JPY')).toBe(500);
    expect(fromMinor(500, 'jpy')).toBe(500);
  });
});

describe('formEncode', () => {
  it('writes Stripe nested keys', () => {
    expect(formEncode({ a: { b: [{ c: 1 }, { c: 'x y' }] }, skip: undefined })).toBe(
      'a%5Bb%5D%5B0%5D%5Bc%5D=1&a%5Bb%5D%5B1%5D%5Bc%5D=x%20y'
    );
  });
});

const line = (over: Record<string, unknown> = {}) => ({
  productId: '77',
  variantId: '2',
  name: 'Shirt',
  optionLabel: 'M / red',
  image: { url: 'https://x/m.jpg', width: null, height: null, alt: null },
  unitPrice: 120,
  quantity: 2,
  total: 240,
  minQuantity: 1,
  maxQuantity: 5,
  ...over
});

describe('checkoutParams', () => {
  const base = {
    currency: 'ILS',
    deliveryLabel: 'Shipping',
    displayNumber: 'K7Q4XM',
    note: 'no plastic',
    locale: 'he',
    siteUrl: 'https://shop.example/'
  };

  it('carries the 1lev1 ids on each line and the fee as its own line', () => {
    const p: any = checkoutParams(
      { ...base, lines: [line()], delivery: { kind: 'delivery', fee: 30, notes: [] } },
      { shippingCountries: ['IL'] }
    );
    expect(p.line_items[0].price_data.unit_amount).toBe(12000);
    expect(p.line_items[0].price_data.product_data.metadata).toEqual({ productId: '77', variantId: '2' });
    expect(p.line_items[0].price_data.product_data.name).toBe('Shirt — M / red');
    expect(p.line_items[1].price_data.product_data.metadata).toEqual({ role: 'delivery' });
    expect(p.line_items[1].price_data.unit_amount).toBe(3000);
    expect(p.shipping_address_collection).toEqual({ allowed_countries: ['IL'] });
    expect(p.success_url).toBe('https://shop.example/order/{CHECKOUT_SESSION_ID}');
    expect(p.metadata).toMatchObject({ displayNumber: 'K7Q4XM', delivery: 'delivery', note: 'no plastic' });
  });

  it('asks no address for pickup and adds no free-fee line', () => {
    const p: any = checkoutParams(
      { ...base, lines: [line()], delivery: { kind: 'pickup', fee: 0, notes: [] } },
      { shippingCountries: ['IL'] }
    );
    expect(p.line_items).toHaveLength(1);
    expect(p.shipping_address_collection).toBeUndefined();
  });
});

const session = {
  id: 'cs_test_1',
  payment_intent: 'pi_3Q8x',
  payment_status: 'paid',
  currency: 'ils',
  amount_total: 27000,
  payment_method_types: ['card'],
  customer_details: { name: 'Dana', email: 'dana@example.com', phone: '+972501234567' },
  shipping_details: {
    name: 'Dana L',
    address: { line1: 'Herzl 1', line2: null, city: 'Netanya', postal_code: '42000', country: 'IL', state: null }
  },
  metadata: { displayNumber: 'K7Q4XM', delivery: 'delivery', note: 'no plastic', locale: 'he' }
};

const lineItems = [
  { quantity: 2, price: { unit_amount: 12000, product: { metadata: { productId: '77', variantId: '2' } } } },
  { quantity: 1, price: { unit_amount: 3000, product: { metadata: { role: 'delivery' } } } },
  { quantity: 1, price: { unit_amount: 999, product: { metadata: {} } } }
];

describe('orderFromSession', () => {
  it('is the POST /orders body, read only from what Stripe returned', () => {
    expect(orderFromSession(session, lineItems)).toEqual({
      externalId: 'pi_3Q8x',
      paymentRef: 'pi_3Q8x',
      paymentMethod: 'card',
      amount: 270,
      currency: 'ILS',
      displayNumber: 'K7Q4XM',
      note: 'no plastic',
      locale: 'he',
      buyer: { name: 'Dana', email: 'dana@example.com', phone: '+972501234567' },
      delivery: {
        preference: 'delivery',
        fee: 30,
        address: { name: 'Dana L', street: 'Herzl 1', city: 'Netanya', postalCode: '42000', country: 'IL' }
      },
      lines: [{ productId: '77', variantId: '2', quantity: 2, unitPrice: 120 }]
    });
  });

  it('falls back to the session id, and to contact for an unknown delivery kind', () => {
    const o = orderFromSession(
      { ...session, payment_intent: null, shipping_details: null, metadata: { delivery: 'teleport' } },
      lineItems.slice(0, 1)
    );
    expect(o.externalId).toBe('cs_test_1');
    expect(o.delivery).toEqual({ preference: 'contact' });
    expect(o.displayNumber).toBeUndefined();
  });
});

describe('the webhook', () => {
  function adapterWith(responses: Record<string, unknown>) {
    const calls: string[] = [];
    const fetcher = (async (url: string) => {
      calls.push(url);
      const key = Object.keys(responses).find((k) => url.includes(k));
      return new Response(JSON.stringify(key ? responses[key] : {}), { status: key ? 200 : 404 });
    }) as unknown as typeof fetch;
    return {
      calls,
      adapter: stripeAdapter({ secretKey: 'sk_test', webhookSecret: SECRET, shippingCountries: ['IL'], fetch: fetcher })
    };
  }

  function request(event: unknown, signature?: string) {
    const body = JSON.stringify(event);
    const t = Math.floor(Date.now() / 1000);
    return new Request('https://shop.example/api/payments/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': signature ?? sign(body, t) },
      body
    });
  }

  it('turns a paid session into the order, reading the lines back from Stripe', async () => {
    const { adapter, calls } = adapterWith({ '/line_items': { data: lineItems } });
    const out = await adapter.parseWebhook(request({ type: 'checkout.session.completed', data: { object: session } }));
    expect(out.kind).toBe('paid');
    if (out.kind === 'paid') expect(out.order.lines).toHaveLength(1);
    expect(calls[0]).toContain('/checkout/sessions/cs_test_1/line_items');
  });

  it('ignores a completed session whose money has not arrived yet', async () => {
    const { adapter, calls } = adapterWith({});
    const out = await adapter.parseWebhook(
      request({ type: 'checkout.session.completed', data: { object: { ...session, payment_status: 'unpaid' } } })
    );
    expect(out.kind).toBe('ignored');
    expect(calls).toEqual([]);
  });

  it('records a delayed payment when it succeeds', async () => {
    const { adapter } = adapterWith({ '/line_items': { data: lineItems } });
    const out = await adapter.parseWebhook(
      request({ type: 'checkout.session.async_payment_succeeded', data: { object: session } })
    );
    expect(out.kind).toBe('paid');
  });

  it('refuses an unsigned notice without calling Stripe', async () => {
    const { adapter, calls } = adapterWith({});
    const out = await adapter.parseWebhook(
      request({ type: 'checkout.session.completed', data: { object: session } }, 't=1,v1=00')
    );
    expect(out.kind).toBe('invalid');
    expect(calls).toEqual([]);
  });

  it('answers the thank-you page from the session', async () => {
    const { adapter } = adapterWith({ '/checkout/sessions/cs_test_1': session });
    expect(await adapter.lookupPayment('cs_test_1')).toEqual({ state: 'paid', externalId: 'pi_3Q8x' });
    expect(await adapter.lookupPayment('../etc')).toEqual({ state: 'unknown', externalId: null });
  });
});
