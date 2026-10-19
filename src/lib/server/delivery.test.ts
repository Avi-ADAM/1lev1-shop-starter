import { describe, expect, it, vi } from 'vitest';
import { checkoutDelivery, deliveryStateOf, pickChoice } from './delivery';
import type { PricedCart } from './cart';
import { cleanAddress, EMPTY_ADDRESS, missingForDelivery, quoteAddressOf } from '$lib/address';
import { checkoutParams, orderFromSession } from './payments/stripe';
import { orderFromPaypal, orderParams } from './payments/paypal';

const priced: PricedCart = {
  lines: [{ productId: '1', variantId: null, unitPrice: 100, quantity: 2, total: 200 } as any],
  items: [],
  currency: 'ILS',
  subtotal: 200,
  problems: [],
  delivery: [{ id: 'pickup', kind: 'pickup', fee: 0, notes: [] }]
};

const option = (over: Record<string, unknown> = {}) => ({
  id: 'm:center:courier',
  kind: 'delivery',
  name: 'שליח',
  fee: 30,
  free: false,
  freeOverRemaining: 100,
  etaMinDays: 1,
  etaMaxDays: 2,
  nextDispatch: null,
  note: null,
  zone: { id: 'center', name: 'מרכז' },
  pickupPoint: null,
  ...over
});

/** A LevConfig whose fetch answers the quote with `body`. */
function cfgAnswering(body: unknown) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  return { cfg: { rikmaUrl: 'https://api.test/api/v1/r/shop', fetch: fetch as any }, fetch };
}

describe('address', () => {
  it('cleans what arrived and knows what a parcel needs', () => {
    const a = cleanAddress({ city: ' רמת  גן ', street: 'ביאליק', country: 'xx1', notes: '<b>hi</b>' });
    expect(a).toMatchObject({ city: 'רמת גן', street: 'ביאליק', country: 'IL', notes: 'bhi/b' });
    expect(missingForDelivery(a)).toEqual(['house']);
    expect(missingForDelivery({ ...EMPTY_ADDRESS, country: 'US', city: 'Boston', street: '1 Main St' })).toEqual(['zip']);
  });

  it('sends the quote only what moves the price', () => {
    expect(quoteAddressOf(EMPTY_ADDRESS)).toBeNull();
    expect(quoteAddressOf({ ...EMPTY_ADDRESS, city: 'חיפה', street: 'x' })).toEqual({ country: 'IL', city: 'חיפה' });
  });
});

describe('delivery state', () => {
  it('without zones the products’ own options stay', () => {
    const s = deliveryStateOf(priced, { configured: false, currency: null });
    expect(s.zones).toBe(false);
    expect(s.choices).toEqual(priced.delivery);
  });

  it('with zones the quote’s options become the choices', () => {
    const s = deliveryStateOf(priced, { configured: true, currency: 'ILS', options: [option() as any], zone: { id: 'center', name: 'מרכז' } });
    expect(s.choices[0]).toMatchObject({ id: 'm:center:courier', kind: 'delivery', fee: 30, name: 'שליח' });
    expect(pickChoice(s, 'm:center:courier')?.fee).toBe(30);
    expect(pickChoice(s, 'nope')?.id).toBe('m:center:courier');
  });
});

describe('checkoutDelivery', () => {
  const full = { ...EMPTY_ADDRESS, city: 'רמת גן', street: 'ביאליק', house: '3' };

  it('quotes again with the address, and lets a full address through', async () => {
    const { cfg, fetch } = cfgAnswering({ configured: true, currency: 'ILS', options: [option()] });
    const r = await checkoutDelivery(cfg, priced, { delivery: 'm:center:courier', address: full, expectedDeliveryFee: 30 });
    expect(r.ok).toBe(true);
    const sent = JSON.parse((fetch.mock.calls[0] as any)[1].body);
    expect(sent.address).toEqual({ country: 'IL', city: 'רמת גן' });
    expect(sent.lines).toEqual([{ productId: '1', variantId: null, quantity: 2, unitPrice: 100 }]);
  });

  it('a fee that moved goes back to the buyer (409)', async () => {
    const { cfg } = cfgAnswering({ configured: true, currency: 'ILS', options: [option({ fee: 45 })] });
    const r = await checkoutDelivery(cfg, priced, { delivery: 'm:center:courier', address: full, expectedDeliveryFee: 30 });
    expect(r).toMatchObject({ ok: false, status: 409, reason: 'changed' });
  });

  it('a parcel without a full address is refused before payment (400)', async () => {
    const { cfg } = cfgAnswering({ configured: true, currency: 'ILS', options: [option()] });
    const r = await checkoutDelivery(cfg, priced, { delivery: 'm:center:courier', address: { city: 'רמת גן' } });
    expect(r).toMatchObject({ ok: false, status: 400, reason: 'address', fields: ['street', 'house'] });
  });
});

describe('the address rides through the payment provider', () => {
  const choice = { id: 'm:center:courier', kind: 'delivery' as const, fee: 30, notes: [] };
  const address = { ...EMPTY_ADDRESS, city: 'רמת גן', street: 'ביאליק', house: '3', apartment: '7' };
  const input = {
    lines: [{ productId: '1', variantId: null, name: 'כד', optionLabel: null, image: null, unitPrice: 100, quantity: 2, total: 200, minQuantity: 1, maxQuantity: 9 }],
    currency: 'ILS',
    delivery: choice,
    deliveryLabel: 'שליח',
    address,
    displayNumber: 'K7Q4XM',
    note: null,
    locale: 'he',
    siteUrl: 'https://shop.test'
  };

  it('Stripe: no second address form, and the order gets ours with the option id', () => {
    const p: any = checkoutParams(input, { shippingCountries: ['IL'] });
    expect(p.shipping_address_collection).toBeUndefined();
    const session = { id: 'cs_1', payment_intent: 'pi_1', currency: 'ils', amount_total: 23000, metadata: p.metadata, customer_details: {} };
    const order = orderFromSession(session, []);
    expect(order.delivery).toMatchObject({
      preference: 'delivery',
      optionId: 'm:center:courier',
      address: { city: 'רמת גן', street: 'ביאליק', house: '3', apartment: '7' }
    });
  });

  it('PayPal: the address is provided, and the option id comes back', () => {
    const p: any = orderParams(input);
    expect(p.payment_source.paypal.experience_context.shipping_preference).toBe('SET_PROVIDED_ADDRESS');
    expect(p.purchase_units[0].shipping.address).toMatchObject({ address_line_1: 'ביאליק 3', admin_area_2: 'רמת גן', country_code: 'IL' });
    const order = orderFromPaypal({ id: 'X', purchase_units: [{ ...p.purchase_units[0], amount: { currency_code: 'ILS', value: '230.00' } }] });
    expect(order.delivery?.optionId).toBe('m:center:courier');
    expect(order.delivery?.address).toMatchObject({ street: 'ביאליק 3', city: 'רמת גן' });
  });
});
