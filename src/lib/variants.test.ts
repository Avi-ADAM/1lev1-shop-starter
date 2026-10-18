import { describe, expect, it } from 'vitest';
import { product, shirt } from '../test/fixtures';
import {
  choose,
  findVariant,
  initialSelection,
  maxQuantityOf,
  shownOf,
  valueExists,
  valueState,
  variantLabel
} from './variants';

describe('the variant picker', () => {
  it('starts on the first variant in stock', () => {
    expect(initialSelection(shirt())).toEqual({ size: 'm', color: 'red' });
  });

  it('finds a variant only once every axis is chosen', () => {
    const p = shirt();
    expect(findVariant(p, { size: 'm' })).toBeNull();
    expect(findVariant(p, { size: 'm', color: 'red' })?.id).toBe('2');
  });

  it('never picks an inactive variant', () => {
    expect(findVariant(shirt(), { size: 's', color: 'blue' })).toBeNull();
  });

  it('crosses out a sold-out value and hides one that was never made', () => {
    const p = shirt();
    expect(valueState(p, { size: 'm', color: 'red' }, 'color', 'blue')).toBe('soldOut');
    expect(valueState(p, { size: 's', color: 'red' }, 'color', 'blue')).toBe('none');
    expect(valueState(p, { size: 's', color: 'red' }, 'size', 'm')).toBe('available');
  });

  it('keeps a value that does not fit the other choices, and moves to a variant that has it', () => {
    const p = shirt();
    expect(valueExists(p, 'color', 'blue')).toBe(true);
    // M/red is chosen; blue in M is sold out, blue in S is inactive - only M/blue carries it.
    expect(choose(p, { size: 'm', color: 'red' }, 'color', 'blue')).toEqual({ size: 'm', color: 'blue' });
    // S/red chosen; blue exists only as M/blue, so the size moves with it.
    expect(choose(p, { size: 's', color: 'red' }, 'color', 'blue')).toEqual({ size: 'm', color: 'blue' });
    expect(choose(p, { size: 'm', color: 'red' }, 'size', 's')).toEqual({ size: 's', color: 'red' });
  });

  it('shows the variant price, stock and pictures - its own gallery first', () => {
    const shown = shownOf(shirt(), { size: 'm', color: 'red' });
    expect(shown.price).toBe(120);
    expect(shown.images[0].url).toBe('https://x/m-red.jpg');
    expect(shown.ready).toBe(true);
  });

  it('falls back to the product gallery when the variant has none', () => {
    const shown = shownOf(shirt(), { size: 's', color: 'red' });
    expect(shown.images[0].url).toBe('https://x/cover.jpg');
  });

  it('is not ready to buy while an axis is open, or when the shop may not sell it', () => {
    expect(shownOf(shirt(), { size: 'm' }).ready).toBe(false);
    expect(shownOf(product({ checkout: false }), {}).ready).toBe(false);
    expect(shownOf(product(), {}).ready).toBe(true);
  });

  it('caps a line by stock and by maxOrder', () => {
    expect(maxQuantityOf(product(), { unlimited: false, quantity: 3 })).toBe(3);
    expect(maxQuantityOf(product({ maxOrder: 2 }), { unlimited: true, quantity: null })).toBe(2);
    expect(maxQuantityOf(product(), { unlimited: false, quantity: -4 })).toBe(0);
  });

  it('labels a variant by its name, else its values', () => {
    const p = shirt();
    expect(variantLabel(p.variants[1])).toBe('M / RED');
    expect(variantLabel({ ...p.variants[1], name: 'M / אדום' })).toBe('M / אדום');
  });
});
