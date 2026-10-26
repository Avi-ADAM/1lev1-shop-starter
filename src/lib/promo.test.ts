import { describe, expect, it } from 'vitest';
import { product, shirt } from '../test/fixtures';
import { cardPrice, chosenPrice, describePromotion, runningPromotions, untilLabel } from './promo';
import type { Promotion } from './types';

const badge = { id: 'p1', name: 'סוף עונה', kind: 'item', endsAt: '2026-11-14T21:59:00.000Z' };

function promo(over: Partial<Promotion> = {}): Promotion {
  return {
    ...badge,
    status: 'active',
    scope: { all: false, products: [], variants: [], categories: [], exclude: [] },
    rule: { pct: 15 },
    startsAt: '2026-11-01T00:00:00.000Z',
    remaining: { units: null, orders: null },
    ...over
  };
}

describe('a promotion on a card', () => {
  it('shows the sale price with the approved price struck through', () => {
    const p = product({ price: 110, priceRange: null, salePrice: 89, promotion: badge });
    expect(cardPrice(p)).toEqual({ now: 89, was: 110, ranged: false, promotion: badge });
  });

  it('reads a simple product with a range the same way', () => {
    const p = product({ price: 100, priceRange: { min: 85, max: 85, currency: 'ILS' }, salePrice: 85, promotion: badge });
    expect(cardPrice(p)).toMatchObject({ now: 85, was: 100, ranged: false, promotion: badge });
  });

  it('strikes the cheapest approved variant when the discounted range starts lower', () => {
    const p = shirt();
    p.variants = p.variants.map((v) => ({ ...v, salePrice: (v.price as number) * 0.5, promotion: badge }));
    p.priceRange = { min: 45, max: 60, currency: 'ILS' };
    expect(cardPrice(p)).toEqual({ now: 45, was: 90, ranged: true, promotion: badge });
  });

  it('shows nothing extra when no promotion runs', () => {
    expect(cardPrice(shirt())).toEqual({ now: 90, was: null, ranged: true, promotion: null });
    expect(cardPrice(product({ priceRange: null }))).toEqual({ now: 100, was: null, ranged: false, promotion: null });
  });

  it('never shows a "sale" that is not lower than the approved price', () => {
    const p = product({ price: 100, priceRange: null, salePrice: 100, promotion: badge });
    expect(cardPrice(p)).toMatchObject({ was: null, promotion: null });
  });
});

describe('a promotion on the product page', () => {
  it('prices the chosen variant', () => {
    const p = shirt();
    const v = { ...p.variants[1], salePrice: 99, promotion: badge };
    expect(chosenPrice(p, v)).toEqual({ now: 99, was: 120, ranged: false, promotion: badge });
    expect(chosenPrice(p, p.variants[1])).toEqual({ now: 120, was: null, ranged: false, promotion: null });
  });
});

describe('the banner', () => {
  const now = new Date('2026-11-05T10:00:00Z');

  it('lists only what runs now and has something left', () => {
    const list = [
      promo({ id: 'a' }),
      promo({ id: 'b', status: 'scheduled' }),
      promo({ id: 'c', startsAt: '2026-11-10T00:00:00Z' }),
      promo({ id: 'd', endsAt: '2026-11-04T00:00:00Z' }),
      promo({ id: 'e', remaining: { units: 0, orders: null } })
    ];
    expect(runningPromotions(list, now).map((p) => p.id)).toEqual(['a']);
  });

  it('says each kind in one sentence', () => {
    expect(describePromotion(promo(), 'ILS')).toBe('15% הנחה');
    expect(describePromotion(promo({ kind: 'store', rule: { pct: 10 }, scope: { ...promo().scope, all: true } }), 'ILS')).toBe('10% הנחה על הכל');
    expect(describePromotion(promo({ kind: 'bundle', rule: { qty: 5, price: 100 } }), 'ILS')).toMatch(/^5 ב-.*100/);
    expect(describePromotion(promo({ kind: 'bxgy', rule: { buy: 1, get: 1, getPct: 100 } }), 'ILS')).toBe('1+1');
    expect(describePromotion(promo({ kind: 'bxgy', rule: { buy: 1, get: 1, getPct: 50 } }), 'ILS')).toBe('השני ב-50% הנחה');
    expect(describePromotion(promo({ kind: 'threshold', rule: { minSubtotal: 300, off: 30 } }), 'ILS')).toMatch(/300.*30/);
    expect(describePromotion(promo({ kind: 'item', rule: {} }), 'ILS')).toBe('');
  });

  it('dates the end in the shop\'s clock', () => {
    // 21:59 UTC on 14.11 is still 14.11 in Israel (UTC+2).
    expect(untilLabel(badge)).toBe('המבצע עד 14.11');
    expect(untilLabel({ ...badge, endsAt: null })).toBe('מבצע');
    expect(untilLabel(null)).toBe('');
  });
});
