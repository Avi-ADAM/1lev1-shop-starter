import type { PricedCart, DeliveryChoice } from './cart';
import { quoteShipping, type LevConfig } from './lev';
import { cleanAddress, missingForDelivery, quoteAddressOf, type BuyerAddress } from '$lib/address';
import type { ShippingOption, ShippingQuote } from '$lib/types';

/**
 * How this cart can reach this buyer, and for how much.
 *
 * When the rikma set shipping up in 1lev1 (zones, rates, pickup points), the
 * answer is 1lev1's quote for the cart and the address — this shop never
 * computes a delivery price itself, so a member changing a rate in 1lev1
 * changes it here with no deploy. When it has not, the cart keeps what it
 * always did: what every product's own delivery options allow.
 */

export interface DeliveryState {
  /** The rikma prices delivery in 1lev1 (zones). */
  zones: boolean;
  choices: DeliveryChoice[];
  /** A delivery method may exist, but there is no city yet to place it. */
  needsAddress: boolean;
  /** The address is outside every zone. */
  outsideZones: boolean;
  zone: { id: string; name: string } | null;
}

export function choiceOf(o: ShippingOption): DeliveryChoice {
  return {
    id: o.id,
    kind: o.kind,
    fee: o.fee,
    notes: o.note ? [o.note] : [],
    name: o.name || null,
    etaMinDays: o.etaMinDays,
    etaMaxDays: o.etaMaxDays,
    nextDispatch: o.nextDispatch,
    freeOverRemaining: o.freeOverRemaining,
    free: o.free,
    pickupPoint: o.pickupPoint
  };
}

/** A quote ⇒ the cart's state. Pure, for the tests. */
export function deliveryStateOf(priced: PricedCart, quote: ShippingQuote): DeliveryState {
  if (!quote.configured || !quote.options) {
    return { zones: false, choices: priced.delivery, needsAddress: false, outsideZones: false, zone: null };
  }
  return {
    zones: true,
    choices: quote.options.map(choiceOf),
    needsAddress: !!quote.needsAddress,
    outsideZones: !!quote.outsideZones,
    zone: quote.zone ?? null
  };
}

export async function deliveryFor(
  cfg: LevConfig,
  priced: PricedCart,
  address: BuyerAddress | null
): Promise<DeliveryState> {
  if (priced.lines.length === 0) return deliveryStateOf(priced, { configured: false, currency: null });
  const quote = await quoteShipping(
    cfg,
    priced.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
    address ? quoteAddressOf(address) : null
  );
  return deliveryStateOf(priced, quote);
}

/** The buyer's pick by id (older pages sent the kind), else the first on offer. */
export function pickChoice(state: DeliveryState, wanted: unknown): DeliveryChoice | null {
  const id = typeof wanted === 'string' ? wanted : '';
  return state.choices.find((c) => c.id === id) ?? state.choices.find((c) => c.kind === id) ?? state.choices[0] ?? null;
}

export type CheckoutDelivery =
  | { ok: true; choice: DeliveryChoice; address: BuyerAddress | null; state: DeliveryState }
  | { ok: false; status: 400 | 409; reason: 'address' | 'changed'; fields?: string[]; state: DeliveryState };

/**
 * Right before payment: the delivery the buyer picked, priced again. A fee
 * that moved since they looked sends the cart back to review (409) — they are
 * never charged a delivery price they did not see. A parcel with no address
 * is refused before the payment page, not after it.
 */
export async function checkoutDelivery(
  cfg: LevConfig,
  priced: PricedCart,
  body: { delivery?: unknown; address?: unknown; expectedDeliveryFee?: unknown }
): Promise<CheckoutDelivery> {
  const address = body.address ? cleanAddress(body.address) : null;
  const state = await deliveryFor(cfg, priced, address);
  const choice = pickChoice(state, body.delivery);
  if (!choice) return { ok: false, status: 409, reason: 'changed', state };
  const asked = typeof body.delivery === 'string' ? body.delivery : '';
  const seenFee = Number(body.expectedDeliveryFee);
  if ((asked && choice.id !== asked && choice.kind !== asked) || (Number.isFinite(seenFee) && seenFee !== choice.fee)) {
    return { ok: false, status: 409, reason: 'changed', state };
  }
  if (choice.kind === 'delivery') {
    const missing = address ? missingForDelivery(address) : ['city', 'street'];
    if (missing.length) return { ok: false, status: 400, reason: 'address', fields: missing, state };
  }
  return { ok: true, choice, address: choice.kind === 'delivery' ? address : null, state };
}
