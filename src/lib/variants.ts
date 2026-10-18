import type { Availability, Image, Product, Variant } from '$lib/types';

/**
 * The variant picker's rules, shared by the product page and the server.
 * Everything a choice changes — price, stock, pictures — is already in the
 * product's one API answer; nothing here calls the network.
 */

export type Selection = Record<string, string>;

/** The variants a buyer may pick. An inactive variant is history, not stock. */
export function activeVariants(product: Product): Variant[] {
  return (product.variants ?? []).filter((v) => v.active !== false);
}

export function matches(variant: Variant, selection: Selection): boolean {
  return Object.entries(selection).every(([key, value]) =>
    variant.optionValues.some((o) => o.key === key && o.value === value)
  );
}

/** The variant a full selection names, or null while an axis is still open. */
export function findVariant(product: Product, selection: Selection): Variant | null {
  const axes = product.options ?? [];
  if (axes.length === 0) return null;
  if (!axes.every((a) => selection[a.key])) return null;
  return activeVariants(product).find((v) => matches(v, selection)) ?? null;
}

export function inStock(a: Availability | null | undefined): boolean {
  if (!a) return false;
  return a.unlimited || (a.quantity ?? 0) > 0;
}

/**
 * Can `value` on `key` still lead to something buyable, given the other axes
 * already chosen? A value that cannot is shown crossed out, not hidden — the
 * buyer learns it exists and is sold out.
 */
export function valueState(
  product: Product,
  selection: Selection,
  key: string,
  value: string
): 'available' | 'soldOut' | 'none' {
  const others = Object.fromEntries(Object.entries(selection).filter(([k]) => k !== key));
  const candidates = activeVariants(product).filter((v) => matches(v, { ...others, [key]: value }));
  if (candidates.length === 0) return 'none';
  return candidates.some((v) => inStock(v.availability)) ? 'available' : 'soldOut';
}

/** Does any variant the buyer may pick carry this value at all? */
export function valueExists(product: Product, key: string, value: string): boolean {
  return activeVariants(product).some((v) => matches(v, { [key]: value }));
}

/**
 * The buyer chose `value` on `key`. When it fits the other choices it is
 * simply added; when it does not (L is chosen, and sand comes only in S/M),
 * the selection moves to the variant that has it and keeps as many of the
 * other choices as it can — in stock first.
 */
export function choose(product: Product, selection: Selection, key: string, value: string): Selection {
  const next = { ...selection, [key]: value };
  const candidates = activeVariants(product).filter((v) => matches(v, { [key]: value }));
  if (candidates.length === 0 || candidates.some((v) => matches(v, next))) return next;
  const kept = (v: Variant) =>
    Object.entries(selection).filter(([k, val]) => k !== key && matches(v, { [k]: val })).length;
  const best = [...candidates].sort(
    (a, b) =>
      Number(inStock(b.availability)) - Number(inStock(a.availability)) || kept(b) - kept(a)
  )[0];
  return Object.fromEntries(best.optionValues.map((o) => [o.key, o.value]));
}

/**
 * The first selection to show: the first variant in stock, else the first
 * one. A one-value axis is chosen for the buyer — there is nothing to ask.
 */
export function initialSelection(product: Product): Selection {
  const variants = activeVariants(product);
  const pick = variants.find((v) => inStock(v.availability)) ?? variants[0];
  if (!pick) return {};
  return Object.fromEntries(pick.optionValues.map((o) => [o.key, o.value]));
}

/** What the page shows for the current selection. */
export function shownOf(product: Product, selection: Selection) {
  const variant = product.hasVariants ? findVariant(product, selection) : null;
  const price = variant ? variant.price : product.price;
  const availability = variant ? variant.availability : product.availability;
  const images: Image[] = variant && variant.images.length > 0 ? variant.images : product.images;
  return {
    variant,
    price,
    compareAtPrice: variant?.compareAtPrice ?? null,
    availability,
    images,
    /** True when the buyer has everything they need to add it to the cart. */
    ready: product.checkout && (!product.hasVariants || variant !== null)
  };
}

/** "M / אדום" — the API's own name for the variant when it has one. */
export function variantLabel(variant: Variant | null): string | null {
  if (!variant) return null;
  if (variant.name) return variant.name;
  const parts = variant.optionValues.map((o) => o.label ?? o.value);
  return parts.length ? parts.join(' / ') : null;
}

/** Largest quantity one line may ask for: stock, then the product's own cap. */
export function maxQuantityOf(product: Product, availability: Availability): number {
  const caps: number[] = [];
  if (!availability.unlimited) caps.push(Math.max(0, availability.quantity ?? 0));
  if (product.maxOrder && product.maxOrder > 0) caps.push(product.maxOrder);
  return caps.length ? Math.min(...caps) : 99;
}

export function minQuantityOf(product: Product): number {
  return product.minOrder && product.minOrder > 0 ? product.minOrder : 1;
}
