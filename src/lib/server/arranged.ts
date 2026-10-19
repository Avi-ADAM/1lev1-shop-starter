import { env } from '$env/dynamic/private';
import type { PricedCart, DeliveryChoice } from './cart';
import type { OrderReport } from '$lib/types';
import { addressForOrder, type BuyerAddress } from '$lib/address';

/**
 * "Order now, pay by arrangement" — the buyer leaves a name and a phone, the
 * shop calls, and the money moves by bit, a transfer or cash at pickup. No
 * payment provider, no fees, no merchant account: a shop can sell on its
 * first day, even with no Stripe or PayPal keys at all.
 *
 * It is not a payment adapter (an adapter has a webhook and a payment to look
 * up; here there is neither). It is a mode of the cart, switched on by
 * `ARRANGED_PAYMENT`. The order goes to 1lev1 with `payment: "arranged"`: it
 * waits there as "awaiting payment" — no sale, no stock taken — until the
 * member who got the money records it, and it lapses by itself if nobody does.
 * So the worst a junk form can do is noise in the orders screen that clears
 * itself; the honeypot and the rate limit below keep even that down.
 */

export type ArrangedChannel = 'phone' | 'whatsapp';
const CHANNELS: ArrangedChannel[] = ['phone', 'whatsapp'];

/** `ARRANGED_PAYMENT=phone,whatsapp` — empty means the mode is off. */
export function arrangedChannels(raw = env.ARRANGED_PAYMENT ?? ''): ArrangedChannel[] {
  const asked = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return CHANNELS.filter((c) => asked.includes(c));
}

/** The shop's own WhatsApp number, digits with the country code (`972501234567`). */
export function shopWhatsapp(raw = env.SHOP_WHATSAPP ?? ''): string | null {
  const d = raw.replace(/\D+/g, '');
  return d.length >= 8 ? d : null;
}

/** How long 1lev1 keeps the order waiting before it lapses (1–720; empty = its default, 72). */
export function arrangedExpiryHours(raw = env.ARRANGED_EXPIRES_HOURS ?? ''): number | null {
  const h = Number(raw);
  return raw.trim() && Number.isFinite(h) && h >= 1 && h <= 720 ? Math.round(h) : null;
}

/**
 * The order's id at 1lev1 and in the thank-you page's address. Random and
 * long enough that nobody can guess another buyer's page; the prefix is how
 * that page knows there is no payment provider to ask.
 */
export const ARRANGED_PREFIX = 'arr_';

export function newArrangedId(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return ARRANGED_PREFIX + [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

export function isArrangedId(id: string): boolean {
  return /^arr_[a-z0-9]{20}$/.test(id);
}

export interface ArrangedBuyer {
  name: string;
  phone: string;
  email: string | null;
}

export type BuyerCheck =
  | { ok: true; buyer: ArrangedBuyer }
  | { ok: false; reason: 'spam' }
  | { ok: false; reason: 'invalid'; fields: Array<'name' | 'phone' | 'email'> };

const short = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * The buyer's details from the form. `website` is the honeypot: a field a
 * person never sees, which a form-filling bot fills — such a request is
 * dropped without telling the bot why. The delivery address is checked with
 * the delivery itself (`checkoutDelivery`), where it also set the price.
 */
export function checkBuyer(body: any): BuyerCheck {
  if (short(body?.website, 200)) return { ok: false, reason: 'spam' };
  const name = short(body?.name, 120);
  const phone = short(body?.phone, 40);
  const email = short(body?.email, 200) || null;
  const fields: Array<'name' | 'phone' | 'email'> = [];
  if (name.length < 2) fields.push('name');
  if (phone.replace(/\D+/g, '').length < 9) fields.push('phone');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.push('email');
  if (fields.length) return { ok: false, reason: 'invalid', fields };
  return { ok: true, buyer: { name, phone, email } };
}

/** What `POST /orders` gets for an arranged order — the same lines a paid one would carry. */
export function arrangedReport(args: {
  externalId: string;
  displayNumber: string;
  priced: PricedCart;
  delivery: DeliveryChoice;
  /** For a parcel: the address that priced it. */
  address: BuyerAddress | null;
  buyer: ArrangedBuyer;
  note: string | null;
  locale: string;
  expiresInHours: number | null;
}): OrderReport {
  const { priced, delivery, buyer, address } = args;
  return {
    externalId: args.externalId,
    payment: 'arranged',
    ...(args.expiresInHours ? { expiresInHours: args.expiresInHours } : {}),
    displayNumber: args.displayNumber,
    currency: priced.currency ?? undefined,
    buyer: { name: buyer.name, phone: buyer.phone, ...(buyer.email ? { email: buyer.email } : {}) },
    delivery: {
      preference: delivery.kind,
      ...(address ? { address: addressForOrder(address) } : {}),
      ...(delivery.fee > 0 ? { fee: delivery.fee } : {}),
      ...(delivery.id !== delivery.kind ? { optionId: delivery.id } : {})
    },
    ...(args.note ? { note: args.note } : {}),
    locale: args.locale,
    lines: priced.lines.map((l) => ({
      productId: l.productId,
      ...(l.variantId ? { variantId: l.variantId } : {}),
      quantity: l.quantity,
      unitPrice: l.unitPrice
    }))
  };
}

/**
 * At most `limit` forms per address per window. In memory, so per server
 * instance — on a serverless host that is a speed bump, not a wall, which is
 * enough: an arranged order creates nothing of value, and lapses on its own.
 */
export function rateLimiter(limit = 5, windowMs = 10 * 60 * 1000) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}
