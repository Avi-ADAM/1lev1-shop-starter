import { browser } from '$app/environment';
import type { CartItem } from '$lib/types';

/**
 * The cart, in the buyer's browser. It holds what they chose — ids and counts
 * — and never a price: the server prices it from the catalog every time
 * (`$lib/server/cart.ts`).
 */

const KEY = 'lev-shop-cart.v1';

function read(): CartItem[] {
  if (!browser) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function sameLine(a: CartItem, productId: string, variantId: string | null) {
  return a.productId === productId && (a.variantId ?? null) === (variantId ?? null);
}

class Cart {
  items = $state<CartItem[]>(read());

  count = $derived(this.items.reduce((s, i) => s + i.quantity, 0));

  #save() {
    if (!browser) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.items));
    } catch {
      // Private mode or a full disk: the cart still works for this visit.
    }
  }

  add(productId: string, variantId: string | null, quantity: number) {
    const line = this.items.find((i) => sameLine(i, productId, variantId));
    if (line) line.quantity += quantity;
    else this.items.push({ productId, variantId, quantity });
    this.#save();
  }

  setQuantity(productId: string, variantId: string | null, quantity: number) {
    if (quantity <= 0) return this.remove(productId, variantId);
    const line = this.items.find((i) => sameLine(i, productId, variantId));
    if (line) line.quantity = quantity;
    this.#save();
  }

  remove(productId: string, variantId: string | null) {
    this.items = this.items.filter((i) => !sameLine(i, productId, variantId));
    this.#save();
  }

  /** Take the server's corrected cart (stock, removed products). */
  replace(items: CartItem[]) {
    this.items = items.map((i) => ({ ...i }));
    this.#save();
  }

  clear() {
    this.items = [];
    this.#save();
  }
}

export const cart = new Cart();
