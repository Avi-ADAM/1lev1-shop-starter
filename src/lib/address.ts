/**
 * The buyer's delivery address — collected on the cart page, before the
 * payment page, because the delivery price depends on it: 1lev1 matches it to
 * the rikma's zones (`POST /shipping/quote`).
 *
 * Israeli-shaped by default (city, street, house number, apartment, floor,
 * entrance — what a courier needs at the door), and still a plain address
 * for abroad (country + postal code). Client-safe: the form and the server
 * read it with the same functions.
 */

export interface BuyerAddress {
  /** ISO alpha-2; '' = Israel. */
  country: string;
  city: string;
  street: string;
  house: string;
  apartment: string;
  floor: string;
  entrance: string;
  zip: string;
  notes: string;
}

export const EMPTY_ADDRESS: BuyerAddress = {
  country: 'IL',
  city: '',
  street: '',
  house: '',
  apartment: '',
  floor: '',
  entrance: '',
  zip: '',
  notes: ''
};

const LIMITS: Record<keyof BuyerAddress, number> = {
  country: 2,
  city: 120,
  street: 160,
  house: 20,
  apartment: 20,
  floor: 20,
  entrance: 20,
  zip: 12,
  notes: 200
};

/** Whatever arrived ⇒ an address of short plain strings. */
export function cleanAddress(raw: unknown): BuyerAddress {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...EMPTY_ADDRESS };
  for (const key of Object.keys(LIMITS) as Array<keyof BuyerAddress>) {
    const s = typeof v[key] === 'string' ? (v[key] as string).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim() : '';
    out[key] = s.slice(0, LIMITS[key]);
  }
  // Checked on what arrived, not on the cut: "Israel" cut to two letters is Iceland.
  const country = typeof v.country === 'string' ? v.country.trim() : '';
  out.country = /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : 'IL';
  return out;
}

/** What a parcel cannot go without. */
export function missingForDelivery(a: BuyerAddress): Array<'city' | 'street' | 'house' | 'zip'> {
  const missing: Array<'city' | 'street' | 'house' | 'zip'> = [];
  if (!a.city) missing.push('city');
  if (!a.street) missing.push('street');
  // In Israel the number is its own field; abroad it is part of the street line.
  if (a.country === 'IL' && !a.house) missing.push('house');
  if (a.country !== 'IL' && !a.zip) missing.push('zip');
  return missing;
}

/** What the quote needs — the rest of the address does not move the price. */
export function quoteAddressOf(a: BuyerAddress): { country: string; city?: string; zip?: string } | null {
  if (!a.city && !a.zip && a.country === 'IL') return null;
  return { country: a.country, ...(a.city ? { city: a.city } : {}), ...(a.zip ? { zip: a.zip } : {}) };
}

/** The address as 1lev1 stores it on the order: a flat bag of the fields that are filled. */
export function addressForOrder(a: BuyerAddress): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) if (v && !(k === 'country' && v === 'IL')) out[k] = v;
  return out;
}

/** One line for a payment provider: "הרצל 12". */
export function streetLine(a: BuyerAddress): string {
  return [a.street, a.house].filter(Boolean).join(' ');
}
