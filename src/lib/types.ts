/**
 * The parts of the 1lev1 rikma API this shop reads. The full contract is the
 * OpenAPI file of the platform (`rikma-v1.openapi.yaml`); everything here is a
 * subset of it, and every field the API may add later is simply ignored.
 */

export interface Availability {
  unlimited: boolean;
  /** `null` iff `unlimited`. */
  quantity: number | null;
}

export interface Image {
  url: string;
  width: number | null;
  height: number | null;
  alt: string | null;
}

export interface OptionValue {
  value: string;
  label: string | null;
  hex: string | null;
  image: Image | null;
}

export interface Option {
  key: string;
  name: string | null;
  values: OptionValue[];
}

export interface VariantOption {
  key: string;
  value: string;
  label: string | null;
}

export interface Variant {
  id: string;
  sku: string | null;
  name: string | null;
  optionValues: VariantOption[];
  price: number | null;
  compareAtPrice: number | null;
  availability: Availability;
  images: Image[];
  active: boolean;
}

export interface DeliveryOption {
  kind: 'pickup' | 'delivery' | 'digital' | 'contact' | string;
  note: string | null;
  fee: number | null;
  currency: string | null;
}

export interface Product {
  id: string;
  name: string;
  descriptionHtml: string | null;
  descriptionText: string | null;
  status: string;
  price: number | null;
  currency: string | null;
  pricingMode: 'fixed' | 'estimated' | 'quote';
  availability: Availability;
  categories: Array<{ id: string; name: string }>;
  images: Image[];
  url: string;
  buyUrl: string | null;
  priceRange: { min: number; max: number; currency: string | null } | null;
  hasVariants: boolean;
  /** May this shop sell it in its own till? `false` ⇒ link to `buyUrl`. */
  checkout: boolean;
  options: Option[];
  variants: Variant[];
  unit: string | null;
  minOrder: number | null;
  maxOrder: number | null;
  leadTimeHours: number | null;
  delivery: DeliveryOption[];
}

export interface RikmaRef {
  id: string;
  slug: string | null;
  name: string | null;
}

export interface Rikma extends RikmaRef {
  about: string | null;
  url: string;
  currency: string | null;
}

export interface Category {
  id: string;
  name: string | null;
  productsCount: number | null;
}

export interface ProductList {
  rikma: RikmaRef;
  data: Product[];
  meta?: { pagination?: { page: number; limit: number; total: number; pages: number } };
}

/** What `GET /orders/{ref}` answers — never the buyer's details. */
export interface OrderView {
  orderRef: string;
  orderId: string | null;
  displayNumber: string | null;
  status: 'pendingPayment' | 'paid' | 'shipped' | 'fulfilled' | 'cancelled' | string;
  /** While an arranged order waits for its payment: when it lapses. */
  expiresAt?: string | null;
  oversold: boolean;
  total: number | null;
  currency: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  fulfilledAt: string | null;
  lines: Array<{
    productId: string | null;
    variantId: string | null;
    quantity: number | null;
    name: string | null;
    optionLabel: string | null;
    unitPrice: number | null;
  }>;
}

/** The body of `POST /orders` (§5.4 of the platform's shop plan). */
export interface OrderReport {
  externalId: string;
  /** `arranged` — nothing was charged; the shop calls and collects (see `$lib/server/arranged.ts`). */
  payment?: 'paid' | 'arranged';
  /** An arranged order lapses after this many hours unpaid (1lev1's default: 72). */
  expiresInHours?: number;
  displayNumber?: string;
  paymentRef?: string;
  paymentMethod?: string;
  amount?: number;
  currency?: string;
  buyer?: { name?: string; email?: string; phone?: string };
  delivery?: {
    preference: 'pickup' | 'delivery' | 'digital' | 'contact';
    address?: Record<string, string>;
    fee?: number;
  };
  note?: string;
  locale?: string;
  lines: Array<{ productId: string; variantId?: string; quantity: number; unitPrice: number }>;
}

/** One cart row as the browser keeps it — ids and a count, never a price. */
export interface CartItem {
  productId: string;
  variantId: string | null;
  quantity: number;
}
