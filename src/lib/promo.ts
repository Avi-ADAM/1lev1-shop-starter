import type { Product, Promotion, PromotionBadge, Variant } from './types';
import { fill, money, shortDate, t } from './texts';

/**
 * A promotion's price on a card or a product page. 1lev1 prices it
 * (`salePrice`, from the item / store promotions the rikma agreed to); the shop
 * only shows it. The struck-through "was" is the rikma's approved `price` — the
 * one buyers actually paid before — never a typed-in `compareAtPrice`.
 */
export interface ShownPrice {
  /** What the buyer pays today. */
  now: number | null;
  /** The approved price, when a promotion takes it lower. */
  was: number | null;
  /** "from …" — the variants sell at different prices. */
  ranged: boolean;
  promotion: PromotionBadge | null;
}

const lower = (sale: number | null | undefined, price: number | null | undefined): sale is number =>
  sale != null && price != null && sale < price;

/** A card: one price for the whole product (the cheapest variant when they differ). */
export function cardPrice(product: Product): ShownPrice {
  const range = product.priceRange;
  if (!range) {
    const sale = lower(product.salePrice, product.price);
    return {
      now: sale ? (product.salePrice as number) : product.price,
      was: sale ? product.price : null,
      ranged: false,
      promotion: sale ? (product.promotion ?? null) : null
    };
  }
  // `priceRange` already reads the discounted prices; the "was" is the cheapest
  // approved price — among the variants, or the product's own when it has none.
  const live = product.variants.filter((v) => v.active && v.price != null);
  const onSale = live.filter((v) => lower(v.salePrice, v.price));
  const approvedMin = live.length ? Math.min(...live.map((v) => v.price as number)) : product.price;
  const promotion = product.promotion ?? onSale[0]?.promotion ?? null;
  return {
    now: range.min,
    was: lower(range.min, approvedMin) ? approvedMin : null,
    ranged: range.min !== range.max,
    promotion: promotion && (onSale.length > 0 || lower(product.salePrice, product.price)) ? promotion : null
  };
}

/** The product page: the chosen variant, or the product itself when it has none. */
export function chosenPrice(product: Product, variant: Variant | null): ShownPrice | null {
  const price = variant ? variant.price : product.price;
  if (price == null) return null;
  const sale = variant ? variant.salePrice : product.salePrice;
  const promotion = variant ? variant.promotion : product.promotion;
  return lower(sale, price)
    ? { now: sale, was: price, ranged: false, promotion: promotion ?? null }
    : { now: price, was: null, ranged: false, promotion: null };
}

/** "המבצע עד 14.11" — or just "מבצע" when it runs until the stock or a cap ends it. */
export function untilLabel(promotion: PromotionBadge | null): string {
  if (!promotion) return '';
  return promotion.endsAt ? fill(t.promoUntil, { date: shortDate(promotion.endsAt) }) : t.promoOn;
}

/** Running now — what a banner shows. Coming ones are 1lev1's to announce, not the shop's. */
export function runningPromotions(promotions: readonly Promotion[], now = new Date()): Promotion[] {
  return promotions.filter(
    (p) =>
      p.status === 'active' &&
      (!p.startsAt || new Date(p.startsAt) <= now) &&
      (!p.endsAt || new Date(p.endsAt) > now) &&
      p.remaining?.units !== 0 &&
      p.remaining?.orders !== 0
  );
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** One sentence a buyer reads: "5 ב-₪100", "השני ב-50%", "10% על הכל". Empty when the rule is unknown. */
export function describePromotion(p: Pick<Promotion, 'kind' | 'rule' | 'scope'>, currency: string | null): string {
  const r = (p.rule ?? {}) as Record<string, unknown>;
  switch (p.kind) {
    case 'item':
    case 'store': {
      const pct = num(r.pct);
      if (pct != null) return fill(p.kind === 'store' && p.scope?.all ? t.promoPctAll : t.promoPct, { pct });
      const price = num(r.price);
      if (price != null) return fill(t.promoFixed, { price: money(price, currency) });
      const off = num(r.off);
      if (off != null) return fill(t.promoOff, { amount: money(off, currency) });
      return '';
    }
    case 'bundle': {
      const qty = num(r.qty);
      const price = num(r.price);
      return qty != null && price != null ? fill(t.promoBundle, { qty, price: money(price, currency) }) : '';
    }
    case 'bxgy': {
      const buy = num(r.buy);
      const get = num(r.get);
      const getPct = num(r.getPct) ?? 100;
      if (buy == null || get == null) return '';
      if (getPct >= 100) return fill(t.promoBxgyFree, { buy, get });
      return buy === 1 && get === 1 ? fill(t.promoSecondPct, { pct: getPct }) : fill(t.promoBxgyPct, { buy, get, pct: getPct });
    }
    case 'threshold': {
      const min = num(r.minSubtotal);
      if (min == null) return '';
      const off = num(r.off);
      const pct = num(r.pct);
      if (off != null) return fill(t.promoOverOff, { min: money(min, currency), amount: money(off, currency) });
      if (pct != null) return fill(t.promoOverPct, { min: money(min, currency), pct });
      return '';
    }
    default:
      return '';
  }
}
