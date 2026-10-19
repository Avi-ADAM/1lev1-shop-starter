import { describe, expect, it } from 'vitest';
import { idsOfSku, moneyValue, orderFromPaypal, orderParams, paypalAdapter, stateOfOrder, toMinor } from './paypal';

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

const base = {
  currency: 'ILS',
  deliveryLabel: 'Shipping',
  address: null,
  displayNumber: 'K7Q4XM',
  note: 'no plastic',
  locale: 'he',
  siteUrl: 'https://shop.example/'
};

describe('money', () => {
  it('keeps two decimals, none for JPY', () => {
    expect(moneyValue(toMinor(19.9, 'ILS'), 'ILS')).toBe('19.90');
    expect(moneyValue(toMinor(1500, 'JPY'), 'JPY')).toBe('1500');
  });
});

describe('sku', () => {
  it('round-trips the 1lev1 ids', () => {
    expect(idsOfSku('77|2')).toEqual({ productId: '77', variantId: '2' });
    expect(idsOfSku('77')).toEqual({ productId: '77' });
    expect(idsOfSku('')).toBeNull();
  });
});

describe('orderParams', () => {
  it('carries the ids in the sku and the fee as shipping, summing exactly', () => {
    const p: any = orderParams({
      ...base,
      lines: [line(), line({ productId: '78', variantId: null, unitPrice: 0.1, quantity: 3, optionLabel: null })],
      delivery: { id: 'delivery', kind: 'delivery', fee: 30, notes: [] }
    });
    const pu = p.purchase_units[0];
    expect(pu.items[0]).toMatchObject({ sku: '77|2', quantity: '2', name: 'Shirt — M / red' });
    expect(pu.items[0].unit_amount).toEqual({ currency_code: 'ILS', value: '120.00' });
    expect(pu.items[1].sku).toBe('78');
    expect(pu.amount.breakdown.item_total.value).toBe('240.30');
    expect(pu.amount.breakdown.shipping.value).toBe('30.00');
    expect(pu.amount.value).toBe('270.30');
    expect(pu.invoice_id).toBe('K7Q4XM');
    expect(pu.custom_id).toBe('delivery|he');
    const ctx = p.payment_source.paypal.experience_context;
    expect(ctx.shipping_preference).toBe('GET_FROM_FILE');
    expect(ctx.return_url).toBe('https://shop.example/api/payments/paypal/return');
    expect(ctx.cancel_url).toBe('https://shop.example/cart');
  });

  it('asks no address for pickup and has no shipping amount', () => {
    const p: any = orderParams({ ...base, lines: [line()], delivery: { id: 'pickup', kind: 'pickup', fee: 0, notes: [] } });
    expect(p.purchase_units[0].amount.breakdown.shipping).toBeUndefined();
    expect(p.payment_source.paypal.experience_context.shipping_preference).toBe('NO_SHIPPING');
  });
});

const captured = {
  id: '5O190127TN364715T',
  status: 'COMPLETED',
  payer: {
    name: { given_name: 'Dana', surname: 'L' },
    email_address: 'dana@example.com',
    phone: { phone_number: { national_number: '0501234567' } }
  },
  purchase_units: [
    {
      invoice_id: 'K7Q4XM',
      custom_id: 'delivery|he',
      description: 'no plastic',
      amount: { currency_code: 'ILS', value: '270.00', breakdown: { shipping: { value: '30.00' } } },
      items: [
        { sku: '77|2', quantity: '2', unit_amount: { value: '120.00' } },
        { quantity: '1', unit_amount: { value: '9.99' } }
      ],
      shipping: {
        name: { full_name: 'Dana L' },
        address: { address_line_1: 'Herzl 1', admin_area_2: 'Netanya', postal_code: '42000', country_code: 'IL' }
      },
      payments: { captures: [{ id: '3C679366HH908993F', status: 'COMPLETED', amount: { value: '270.00' } }] }
    }
  ]
};

describe('orderFromPaypal', () => {
  it('is the POST /orders body, read only from what PayPal returned', () => {
    expect(orderFromPaypal(captured)).toEqual({
      externalId: '5O190127TN364715T',
      paymentRef: '3C679366HH908993F',
      paymentMethod: 'paypal',
      amount: 270,
      currency: 'ILS',
      buyer: { name: 'Dana L', email: 'dana@example.com', phone: '0501234567' },
      delivery: {
        preference: 'delivery',
        address: { name: 'Dana L', street: 'Herzl 1', city: 'Netanya', zip: '42000', country: 'IL' },
        fee: 30
      },
      lines: [{ productId: '77', variantId: '2', quantity: 2, unitPrice: 120 }],
      displayNumber: 'K7Q4XM',
      note: 'no plastic',
      locale: 'he'
    });
  });

  it('counts as paid only once the capture completed', () => {
    expect(stateOfOrder(captured)).toBe('paid');
    expect(stateOfOrder({ status: 'APPROVED' })).toBe('pending');
    const pending = structuredClone(captured);
    pending.purchase_units[0].payments.captures[0].status = 'PENDING';
    expect(stateOfOrder(pending)).toBe('pending');
    expect(stateOfOrder({ status: 'CREATED' })).toBe('unpaid');
  });
});

describe('the adapter', () => {
  const approved = { ...captured, status: 'APPROVED', purchase_units: [{ ...captured.purchase_units[0], payments: undefined }] };

  function adapterWith(routes: Array<[string, string, (body: string | undefined) => [number, unknown]]>) {
    const calls: string[] = [];
    const fetcher = (async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push(`${method} ${url.replace(/^https:\/\/[^/]+/, '')}`);
      if (url.endsWith('/v1/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'A21', expires_in: 32000 }));
      }
      const route = routes.find(([m, p]) => m === method && url.endsWith(p));
      const [status, body] = route ? route[2](init.body as string | undefined) : [404, { name: 'RESOURCE_NOT_FOUND' }];
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return {
      calls,
      adapter: paypalAdapter({
        clientId: 'id',
        clientSecret: 'secret',
        webhookId: 'WH-1',
        environment: 'sandbox',
        shippingCountries: ['IL'],
        fetch: fetcher
      })
    };
  }

  const ret = (token: string) => new URL(`https://shop.example/api/payments/paypal/return?token=${token}&PayerID=X`);

  it('sends the buyer to the approval link', async () => {
    const { adapter, calls } = adapterWith([
      ['POST', '/v2/checkout/orders', () => [200, { links: [{ rel: 'payer-action', href: 'https://paypal/approve' }] }]]
    ]);
    const out = await adapter.createCheckout({ ...base, lines: [line()], delivery: { id: 'pickup', kind: 'pickup', fee: 0, notes: [] } });
    expect(out.redirectUrl).toBe('https://paypal/approve');
    expect(calls).toEqual(['POST /v1/oauth2/token', 'POST /v2/checkout/orders']);
  });

  it('captures on return and reads the order back', async () => {
    const { adapter, calls } = adapterWith([
      ['GET', `/v2/checkout/orders/${captured.id}`, () => [200, approved]],
      ['POST', `/v2/checkout/orders/${captured.id}/capture`, () => [201, captured]]
    ]);
    const out = await adapter.confirmReturn!(ret(captured.id));
    expect(out.paymentId).toBe(captured.id);
    expect(out.outcome.kind).toBe('paid');
    expect(calls).toContain(`POST /v2/checkout/orders/${captured.id}/capture`);
  });

  it('does not charge an address it cannot ship to', async () => {
    const abroad = structuredClone(approved) as any;
    abroad.purchase_units[0].shipping.address.country_code = 'US';
    const { adapter, calls } = adapterWith([['GET', `/v2/checkout/orders/${captured.id}`, () => [200, abroad]]]);
    const out = await adapter.confirmReturn!(ret(captured.id));
    expect(out.shippingRefused).toBe(true);
    expect(calls.some((c) => c.endsWith('/capture'))).toBe(false);
  });

  it('treats an order already captured (the webhook won the race) as paid', async () => {
    let gets = 0;
    const { adapter } = adapterWith([
      ['GET', `/v2/checkout/orders/${captured.id}`, () => [200, gets++ === 0 ? approved : captured]],
      [
        'POST',
        `/v2/checkout/orders/${captured.id}/capture`,
        () => [422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }]
      ]
    ]);
    expect((await adapter.confirmReturn!(ret(captured.id))).outcome.kind).toBe('paid');
  });

  function notice(event: unknown) {
    return new Request('https://shop.example/api/payments/paypal/webhook', {
      method: 'POST',
      headers: { 'paypal-transmission-id': 't1', 'paypal-auth-algo': 'SHA256withRSA' },
      body: JSON.stringify(event)
    });
  }

  it('records a completed capture from a verified notice, reading the order from PayPal', async () => {
    let verifyBody = '';
    const { adapter } = adapterWith([
      [
        'POST',
        '/v1/notifications/verify-webhook-signature',
        (b) => ((verifyBody = b ?? ''), [200, { verification_status: 'SUCCESS' }])
      ],
      ['GET', `/v2/checkout/orders/${captured.id}`, () => [200, captured]]
    ]);
    const event = {
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAP', supplementary_data: { related_ids: { order_id: captured.id } } }
    };
    const out = await adapter.parseWebhook(notice(event));
    expect(out.kind).toBe('paid');
    expect(JSON.parse(verifyBody)).toMatchObject({ webhook_id: 'WH-1', transmission_id: 't1', webhook_event: event });
  });

  it('refuses a notice PayPal does not confirm, without reading any order', async () => {
    const { adapter, calls } = adapterWith([
      ['POST', '/v1/notifications/verify-webhook-signature', () => [200, { verification_status: 'FAILURE' }]]
    ]);
    const out = await adapter.parseWebhook(notice({ event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: captured.id } }));
    expect(out.kind).toBe('invalid');
    expect(calls.some((c) => c.includes('/v2/checkout/orders'))).toBe(false);
  });

  it('answers the thank-you page from the order', async () => {
    const { adapter } = adapterWith([['GET', `/v2/checkout/orders/${captured.id}`, () => [200, captured]]]);
    expect(adapter.ownsPaymentId(captured.id)).toBe(true);
    expect(adapter.ownsPaymentId('cs_test_1')).toBe(false);
    expect(await adapter.lookupPayment(captured.id)).toEqual({ state: 'paid', externalId: captured.id });
    expect(await adapter.lookupPayment('../etc')).toEqual({ state: 'unknown', externalId: null });
  });
});
