import { describe, expect, it } from 'vitest';
import { product, shirt } from '../../test/fixtures';
import { deliveryChoicesOf, normalizeItems, priceCart } from './cart';
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
