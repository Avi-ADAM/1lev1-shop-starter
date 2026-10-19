import type { CartItem, DeliveryOption, Image, PickupPoint, Product } from '$lib/types';
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
 */

export const MAX_CART_LINES = 50; // POST /orders takes at most 50 lines

export interface PricedLine {
  productId: string;
  variantId: string | null;
  name: string;
  optionLabel: string | null;
  image: Image | null;
  unitPrice: number;
  quantity: number;
  total: number;
  minQuantity: number;
  maxQuantity: number;
}

export type CartProblem =
  | { kind: 'gone'; productId: string; variantId: string | null }
  | { kind: 'notForSale'; productId: string; name: string; buyUrl: string | null }
  | { kind: 'soldOut'; productId: string; variantId: string | null; name: string }
  | { kind: 'adjusted'; productId: string; variantId: string | null; name: string; quantity: number }
  | { kind: 'currency'; productId: string; name: string }
  | { kind: 'tooManyLines' };

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
  subtotal: number;
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
  getProduct: (id: string) => Promise<Product | null>
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
      unitPrice,
      quantity,
      total: round2(unitPrice * quantity),
      minQuantity: min,
      maxQuantity: max
    });
    kept.push({ productId: product.id, variantId: variant?.id ?? null, quantity });
    sold.push(product);
  }

  return {
    lines,
    items: kept,
    currency,
    subtotal: round2(lines.reduce((s, l) => s + l.total, 0)),
    problems,
    delivery: deliveryChoicesOf(sold)
  };
}
