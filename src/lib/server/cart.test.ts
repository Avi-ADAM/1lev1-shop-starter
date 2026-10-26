import { describe, expect, it } from 'vitest';
import { product, shirt } from '../../test/fixtures';
import { applyQuote, chargeLines, deliveryChoicesOf, endedPromotions, normalizeItems, priceCart } from './cart';
import type { Product } from '$lib/types';

function catalog(...products: Product[]) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return async (id: string) => byId.get(id) ?? null;
}

describe('normalizeItems', () => {
  it('merges the same line, drops junk, floors counts', () => {
    expect(
      normalizeItems([
        { productId: '1', variantId: null, quantity: 1 },
        { productId: '1', quantity: 2.7 },
        { productId: 'x', quantity: 1 },
        { productId: '2', variantId: '9', quantity: 0 },
        { productId: '3', variantId: '../', quantity: 1 }
      ])
    ).toEqual([{ productId: '1', variantId: null, quantity: 3 }]);
    expect(normalizeItems('nope')).toEqual([]);
  });
});

describe('priceCart - the price is the catalog, never the browser', () => {
  it('prices a plain product and a variant from the API', async () => {
    const res = await priceCart(
      [
        { productId: '1842', variantId: null, quantity: 2, price: 1 },
        { productId: '77', variantId: '2', quantity: 1 }
      ],
      catalog(product(), shirt())
    );
    expect(res.problems).toEqual([]);
    expect(res.lines.map((l) => [l.productId, l.variantId, l.unitPrice, l.total])).toEqual([
      ['1842', null, 100, 200],
      ['77', '2', 120, 120]
    ]);
    expect(res.subtotal).toBe(320);
    expect(res.currency).toBe('ILS');
    expect(res.lines[1].image?.url).toBe('https://x/m-red.jpg');
  });

  it('removes what is gone, not for sale, sold out, an inactive variant, or a missing variant', async () => {
    const res = await priceCart(
      [
        { productId: '5', quantity: 1 },
        { productId: '6', quantity: 1 },
        { productId: '77', variantId: '3', quantity: 1 },
        { productId: '77', variantId: '4', quantity: 1 },
        { productId: '77', quantity: 1 }
      ],
      catalog(product({ id: '6', checkout: false }), shirt())
    );
    expect(res.lines).toEqual([]);
    expect(res.items).toEqual([]);
    expect(res.problems.map((p) => p.kind)).toEqual(['gone', 'notForSale', 'soldOut', 'gone', 'gone']);
  });

  it('clamps to stock and to the order limits, and says so', async () => {
    const res = await priceCart(
      [
        { productId: '1', quantity: 50 },
        { productId: '2', quantity: 1 }
      ],
      catalog(
        product({ id: '1', availability: { unlimited: false, quantity: 4 } }),
        product({ id: '2', minOrder: 3, availability: { unlimited: true, quantity: null } })
      )
    );
    expect(res.items).toEqual([
      { productId: '1', variantId: null, quantity: 4 },
      { productId: '2', variantId: null, quantity: 3 }
    ]);
    expect(res.problems.map((p) => p.kind)).toEqual(['adjusted', 'adjusted']);
  });

  it('keeps one currency per cart', async () => {
    const res = await priceCart(
      [
        { productId: '1', quantity: 1 },
        { productId: '2', quantity: 1 }
      ],
      catalog(
        product({ id: '1' }),
        product({ id: '2', currency: 'USD', priceRange: { min: 5, max: 5, currency: 'USD' } })
      )
    );
    expect(res.lines).toHaveLength(1);
    expect(res.problems[0].kind).toBe('currency');
  });

  it('refuses a draft even if the API returned one (a read key that sees drafts)', async () => {
    const res = await priceCart([{ productId: '1', quantity: 1 }], catalog(product({ id: '1', status: 'draft' })));
    expect(res.lines).toEqual([]);
  });
});

describe('deliveryChoicesOf', () => {
  const pickup = { kind: 'pickup', note: 'studio', fee: 0, currency: 'ILS' };
  const ship = (fee: number) => ({ kind: 'delivery', note: null, fee, currency: 'ILS' });

  it('offers what every product offers, at the highest fee', () => {
    const res = deliveryChoicesOf([
      product({ delivery: [pickup, ship(30)] }),
      product({ delivery: [ship(40)] }),
      product({ delivery: [] })
    ]);
    expect(res).toEqual([{ id: 'delivery', kind: 'delivery', fee: 40, notes: [] }]);
  });

  it('falls back to contact when nothing is shared', () => {
    expect(deliveryChoicesOf([product()])).toEqual([{ id: 'contact', kind: 'contact', fee: 0, notes: [] }]);
    expect(deliveryChoicesOf([product({ delivery: [pickup] }), product({ delivery: [ship(10)] })])).toEqual([
      { id: 'contact', kind: 'contact', fee: 0, notes: [] }
    ]);
  });
});

describe('promotions — 1lev1 prices, the shop asks', () => {
  const quoteOf = (lines: any[], over: Record<string, unknown> = {}) => ({
    currency: 'ILS',
    lines,
    listTotal: 0,
    subtotal: 0,
    thresholdDiscount: 0,
    total: 0,
    applied: [{ promotionId: '9', name: 'Summer', kind: 'bundle', discount: 10 }],
    hints: [],
    ...over
  });

  it("charges the quote's line totals and names the promotion", async () => {
    const res = await priceCart([{ productId: '1', quantity: 3 }], catalog(product({ id: '1', price: 40 })), async (lines) =>
      quoteOf(lines.map((l) => ({ ...l, listPrice: 40, unitPrice: 33.3333, lineTotal: 100, discount: 20, promotionId: '9' })))
    );
    expect(res.listSubtotal).toBe(120);
    expect(res.subtotal).toBe(100);
    expect(res.lines[0]).toMatchObject({ listPrice: 40, total: 100, promotionId: '9' });
    expect(res.promotions).toEqual([{ id: '9', name: 'Summer' }]);
  });

  it('a quote that disagrees about the cart, or fails, leaves the catalog prices', async () => {
    const wrongQty = await priceCart([{ productId: '1', quantity: 2 }], catalog(product({ id: '1', price: 40 })), async (lines) =>
      quoteOf(lines.map((l) => ({ ...l, quantity: 1, listPrice: 40, unitPrice: 30, lineTotal: 30, discount: 10, promotionId: '9' })))
    );
    expect(wrongQty.subtotal).toBe(80);
    const failed = await priceCart([{ productId: '1', quantity: 2 }], catalog(product({ id: '1', price: 40 })), async () => {
      throw new Error('down');
    });
    expect(failed.subtotal).toBe(80);
    expect(failed.lines[0].promotionId).toBeNull();
  });

  it('never charges more than the catalog', () => {
    const line = { productId: '1', variantId: null, name: 'A', optionLabel: null, image: null, listPrice: 40, unitPrice: 40, quantity: 1, total: 40, promotionId: null, minQuantity: 1, maxQuantity: 9 };
    const q = quoteOf([{ lineId: '0', productId: '1', variantId: null, quantity: 1, listPrice: 40, unitPrice: 55, lineTotal: 55, discount: 0, promotionId: '9' }]);
    expect(applyQuote([line], q as any)?.lines[0]).toMatchObject({ total: 40, promotionId: null });
  });

  it('a total that does not split into whole cents becomes two charge lines', () => {
    const line = { productId: '1', variantId: null, name: 'A', optionLabel: null, image: null, listPrice: 40, unitPrice: 33.3333, quantity: 3, total: 100, promotionId: '9', minQuantity: 1, maxQuantity: 9 };
    const charged = chargeLines([line]);
    expect(charged.map((l) => [l.quantity, l.unitPrice])).toEqual([[2, 33.33], [1, 33.34]]);
    expect(charged.reduce((s, l) => s + Math.round(l.unitPrice * 100) * l.quantity, 0)).toBe(10000);
    expect(chargeLines([{ ...line, total: 99, unitPrice: 33 }])).toHaveLength(1);
  });

  it('a promotion the buyer saw and that is gone says so by name', () => {
    const priced = { promotions: [{ id: '2', name: null }] } as any;
    expect(endedPromotions(priced, [{ id: '9', name: 'Summer' }, { id: '2', name: 'x' }])).toEqual([{ kind: 'promotionEnded', name: 'Summer' }]);
    expect(endedPromotions(priced, 'junk')).toEqual([]);
  });
});
