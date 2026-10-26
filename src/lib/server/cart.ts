import type { CartItem, CartQuote, DeliveryOption, Image, PickupPoint, Product } from '$lib/types';
import {
  activeVariants,
  maxQuantityOf,
  minQuantityOf,
  variantLabel
} from '$lib/variants';

/**
 * The cart, priced on the server from the catalog **now**.
 *
 * The browser keeps ids and counts only. Every price that reaches the payment
 * page is read here from 1lev1, so a buyer who edits the page's JavaScript can
 * change what they asked for but never what it costs. The same function
 * prices the cart page and the checkout, so what the buyer saw is what they
 * are charged.
 *
 * Promotions are 1lev1's to price (`POST /cart/quote`): the lines this file
 * keeps are sent there, and its answer replaces the catalog prices. A 1lev1
 * that cannot answer leaves the catalog prices — never less than a promotion.
 */

export const MAX_CART_LINES = 50; // POST /orders takes at most 50 lines

export interface PricedLine {
  productId: string;
  variantId: string | null;
  name: string;
  optionLabel: string | null;
  image: Image | null;
  /** The approved price of one unit, before any promotion. */
  listPrice: number;
  /** What one unit costs — an average when a bundle or a threshold is shared out. */
  unitPrice: number;
  quantity: number;
  /** The exact amount due for the line. */
  total: number;
  /** The promotion that priced it — reported back on the order. */
  promotionId: string | null;
  minQuantity: number;
  maxQuantity: number;
}

export type CartProblem =
  | { kind: 'gone'; productId: string; variantId: string | null }
  | { kind: 'notForSale'; productId: string; name: string; buyUrl: string | null }
  | { kind: 'soldOut'; productId: string; variantId: string | null; name: string }
  | { kind: 'adjusted'; productId: string; variantId: string | null; name: string; quantity: number }
  | { kind: 'currency'; productId: string; name: string }
  | { kind: 'tooManyLines' }
  | { kind: 'promotionEnded'; name: string };

export interface DeliveryChoice {
  /** What the buyer picks and the order reports: the rikma's option id, or the kind itself. */
  id: string;
  kind: 'pickup' | 'delivery' | 'digital' | 'contact';
  fee: number;
  notes: string[];
  /** The method's or pickup point's own name, when the rikma set shipping up. */
  name?: string | null;
  etaMinDays?: number | null;
  etaMaxDays?: number | null;
  nextDispatch?: string | null;
  freeOverRemaining?: number | null;
  free?: boolean;
  pickupPoint?: PickupPoint | null;
}

export interface PricedCart {
  lines: PricedLine[];
  /** The cart after the adjustments — what the browser should keep. */
  items: CartItem[];
  currency: string | null;
  /** What the lines would cost at the approved prices. */
  listSubtotal: number;
  subtotal: number;
  /** The promotions that lowered this cart, and what would lower it more ("2 more for 3 for 100"). */
  promotions: Array<{ id: string; name: string | null }>;
  hints: CartQuote['hints'];
  problems: CartProblem[];
  delivery: DeliveryChoice[];
}

const KINDS = ['pickup', 'delivery', 'digital', 'contact'] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Same product and variant ⇒ one line; a count is a positive integer. */
export function normalizeItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map<string, CartItem>();
  for (const r of raw) {
    const productId = String((r as any)?.productId ?? '');
    if (!/^\d{1,12}$/.test(productId)) continue;
    const v = (r as any)?.variantId;
    const variantId = v == null || v === '' ? null : String(v);
    if (variantId !== null && !/^\d{1,12}$/.test(variantId)) continue;
    const quantity = Math.floor(Number((r as any)?.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const key = `${productId}:${variantId ?? ''}`;
    const prev = byKey.get(key);
    if (prev) prev.quantity += quantity;
    else byKey.set(key, { productId, variantId, quantity });
  }
  return [...byKey.values()];
}

/**
 * Which ways can the whole cart reach the buyer? A kind every product that
 * says anything offers; its fee is the highest any of them asks (it is one
 * parcel). Nobody saying anything ⇒ "we will be in touch".
 */
export function deliveryChoicesOf(products: Product[]): DeliveryChoice[] {
  const declaring = products.filter((p) => (p.delivery ?? []).length > 0);
  if (declaring.length === 0) return [{ id: 'contact', kind: 'contact', fee: 0, notes: [] }];
  const choices: DeliveryChoice[] = [];
  for (const kind of KINDS) {
    const offers: DeliveryOption[] = [];
    let everyone = true;
    for (const p of declaring) {
      const o = p.delivery.find((d) => d.kind === kind);
      if (!o) {
        everyone = false;
        break;
      }
      offers.push(o);
    }
    if (!everyone) continue;
    choices.push({
      id: kind,
      kind,
      fee: round2(Math.max(0, ...offers.map((o) => o.fee ?? 0))),
      notes: [...new Set(offers.map((o) => o.note).filter((n): n is string => !!n))]
    });
  }
  return choices.length ? choices : [{ id: 'contact', kind: 'contact', fee: 0, notes: [] }];
}

export async function priceCart(
  rawItems: unknown,
  getProduct: (id: string) => Promise<Product | null>,
  quote?: (lines: Array<{ lineId: string; productId: string; variantId: string | null; quantity: number }>) => Promise<CartQuote | null>
): Promise<PricedCart> {
  const problems: CartProblem[] = [];
  let items = normalizeItems(rawItems);
  if (items.length > MAX_CART_LINES) {
    items = items.slice(0, MAX_CART_LINES);
    problems.push({ kind: 'tooManyLines' });
  }

  const ids = [...new Set(items.map((i) => i.productId))];
  const products = new Map<string, Product | null>(
    await Promise.all(ids.map(async (id) => [id, await getProduct(id)] as const))
  );

  const lines: PricedLine[] = [];
  const kept: CartItem[] = [];
  const sold: Product[] = [];
  let currency: string | null = null;

  for (const item of items) {
    const product = products.get(item.productId) ?? null;
    if (!product || product.status !== 'published') {
      problems.push({ kind: 'gone', productId: item.productId, variantId: item.variantId });
      continue;
    }
    if (!product.checkout) {
      problems.push({ kind: 'notForSale', productId: product.id, name: product.name, buyUrl: product.buyUrl });
      continue;
    }

    let variant = null;
    if (product.hasVariants) {
      variant = activeVariants(product).find((v) => v.id === item.variantId) ?? null;
      if (!variant) {
        problems.push({ kind: 'gone', productId: product.id, variantId: item.variantId });
        continue;
      }
    } else if (item.variantId !== null) {
      problems.push({ kind: 'gone', productId: product.id, variantId: item.variantId });
      continue;
    }

    const unitPrice = variant ? variant.price : product.price;
    if (unitPrice == null || !(unitPrice >= 0)) {
      problems.push({ kind: 'notForSale', productId: product.id, name: product.name, buyUrl: product.buyUrl });
      continue;
    }
    const lineCurrency = (product.priceRange?.currency ?? product.currency ?? '').toUpperCase() || null;
    if (currency === null) currency = lineCurrency;
    else if (lineCurrency !== currency) {
      problems.push({ kind: 'currency', productId: product.id, name: product.name });
      continue;
    }

    const availability = variant ? variant.availability : product.availability;
    const max = maxQuantityOf(product, availability);
    const min = minQuantityOf(product);
    const name = product.name;
    if (max <= 0 || max < min) {
      problems.push({ kind: 'soldOut', productId: product.id, variantId: item.variantId, name });
      continue;
    }
    const quantity = Math.min(max, Math.max(min, item.quantity));
    if (quantity !== item.quantity) {
      problems.push({ kind: 'adjusted', productId: product.id, variantId: item.variantId, name, quantity });
    }

    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      name,
      optionLabel: variantLabel(variant),
      image: (variant?.images?.[0] ?? product.images?.[0]) || null,
      listPrice: unitPrice,
      unitPrice,
      quantity,
      total: round2(unitPrice * quantity),
      promotionId: null,
      minQuantity: min,
      maxQuantity: max
    });
    kept.push({ productId: product.id, variantId: variant?.id ?? null, quantity });
    sold.push(product);
  }

  const listSubtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  let promoted: ReturnType<typeof applyQuote> = null;
  if (quote && lines.length) {
    try {
      promoted = applyQuote(lines, await quote(lines.map((l, i) => ({ lineId: String(i), productId: l.productId, variantId: l.variantId, quantity: l.quantity }))));
    } catch (e) {
      // The catalog prices stand: never less than a promotion would charge.
      console.error('[shop] the cart could not be quoted under promotions:', e);
    }
  }
  const priced = promoted?.lines ?? lines;

  return {
    lines: priced,
    items: kept,
    currency,
    listSubtotal,
    subtotal: round2(priced.reduce((s, l) => s + l.total, 0)),
    promotions: promoted?.promotions ?? [],
    hints: promoted?.hints ?? [],
    problems,
    delivery: deliveryChoicesOf(sold)
  };
}

/**
 * 1lev1's answer over the lines this shop priced. Any disagreement about what
 * is in the cart (a line missing, another quantity) ⇒ null, and the catalog
 * prices stand.
 */
export function applyQuote(
  lines: PricedLine[],
  q: CartQuote | null
): { lines: PricedLine[]; promotions: PricedCart['promotions']; hints: CartQuote['hints'] } | null {
  if (!q || !Array.isArray(q.lines) || q.lines.length !== lines.length) return null;
  const byId = new Map(q.lines.map((l) => [String(l.lineId), l]));
  const out: PricedLine[] = [];
  for (const [i, line] of lines.entries()) {
    const ql = byId.get(String(i));
    if (!ql || ql.quantity !== line.quantity || ql.productId !== line.productId || !(ql.lineTotal >= 0)) return null;
    // A promotion only ever lowers a line; anything else is not ours to charge.
    const total = Math.min(line.total, round2(ql.lineTotal));
    out.push({
      ...line,
      listPrice: ql.listPrice ?? line.listPrice,
      unitPrice: Math.round((total / line.quantity) * 10000) / 10000,
      total,
      promotionId: total < line.total ? (ql.promotionId ?? null) : null
    });
  }
  const names = new Map((q.applied ?? []).map((a) => [String(a.promotionId), a.name ?? null]));
  const ids = [...new Set(out.map((l) => l.promotionId).filter((id): id is string => !!id))];
  return { lines: out, promotions: ids.map((id) => ({ id, name: names.get(id) ?? null })), hints: Array.isArray(q.hints) ? q.hints : [] };
}

/**
 * The promotions the buyer saw that no longer price the cart — "the
 * promotion ended" instead of a bare "something changed".
 */
export function endedPromotions(priced: PricedCart, seen: unknown): CartProblem[] {
  if (!Array.isArray(seen)) return [];
  const now = new Set(priced.promotions.map((p) => p.id));
  return seen
    .map((p: any) => ({ id: String(p?.id ?? ''), name: typeof p?.name === 'string' ? p.name.slice(0, 80) : '' }))
    .filter((p) => p.id && !now.has(p.id))
    .map((p) => ({ kind: 'promotionEnded' as const, name: p.name }));
}

/**
 * The lines as a payment page charges them: a unit price in whole cents.
 * A line whose exact total does not split evenly into its units becomes two —
 * the units at the lower cent, and one unit carrying the remainder — so the
 * charge is the quoted total to the cent.
 */
export function chargeLines(lines: PricedLine[]): PricedLine[] {
  return lines.flatMap((l) => {
    const cents = Math.round((Number.isFinite(l.total) ? l.total : l.unitPrice * l.quantity) * 100);
    if (cents % l.quantity === 0) return [{ ...l, unitPrice: cents / l.quantity / 100 }];
    const low = Math.floor(cents / l.quantity);
    const rest = cents - low * (l.quantity - 1);
    return [
      { ...l, quantity: l.quantity - 1, unitPrice: low / 100, total: round2((low * (l.quantity - 1)) / 100) },
      { ...l, quantity: 1, unitPrice: rest / 100, total: rest / 100 }
    ];
  });
}
