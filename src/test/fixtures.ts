import type { Product, Variant } from '$lib/types';

/** Test data in the shape the 1lev1 API answers. */
export function variant(over: Partial<Variant> & { id: string; opts: Record<string, string> }): Variant {
  const { opts, ...rest } = over;
  return {
    sku: null,
    name: null,
    optionValues: Object.entries(opts).map(([key, value]) => ({ key, value, label: value.toUpperCase() })),
    price: 100,
    compareAtPrice: null,
    availability: { unlimited: false, quantity: 5 },
    images: [],
    active: true,
    ...rest
  };
}

export function product(over: Partial<Product> = {}): Product {
  return {
    id: '1842',
    name: 'ספל',
    descriptionHtml: null,
    descriptionText: null,
    status: 'published',
    price: 100,
    currency: 'ILS',
    pricingMode: 'fixed',
    availability: { unlimited: false, quantity: 10 },
    categories: [],
    images: [{ url: 'https://x/cover.jpg', width: 800, height: 800, alt: null }],
    url: 'https://www.1lev1.com/gift/1842',
    buyUrl: 'https://www.1lev1.com/gift/1842#request',
    priceRange: { min: 100, max: 100, currency: 'ILS' },
    hasVariants: false,
    checkout: true,
    options: [],
    variants: [],
    unit: null,
    minOrder: null,
    maxOrder: null,
    leadTimeHours: null,
    delivery: [],
    ...over
  };
}

/** A shirt in S/M × red/blue, M/blue sold out, S/blue never made. */
export function shirt(): Product {
  return product({
    id: '77',
    name: 'חולצה',
    hasVariants: true,
    priceRange: { min: 90, max: 120, currency: 'ILS' },
    options: [
      { key: 'size', name: 'מידה', values: [{ value: 's', label: 'S', hex: null, image: null }, { value: 'm', label: 'M', hex: null, image: null }] },
      { key: 'color', name: 'צבע', values: [{ value: 'red', label: 'אדום', hex: '#c33', image: null }, { value: 'blue', label: 'כחול', hex: '#33c', image: null }] }
    ],
    variants: [
      variant({ id: '1', opts: { size: 's', color: 'red' }, price: 90, availability: { unlimited: false, quantity: 0 } }),
      variant({ id: '2', opts: { size: 'm', color: 'red' }, price: 120, images: [{ url: 'https://x/m-red.jpg', width: null, height: null, alt: null }] }),
      variant({ id: '3', opts: { size: 'm', color: 'blue' }, price: 120, availability: { unlimited: false, quantity: 0 } }),
      variant({ id: '4', opts: { size: 's', color: 'blue' }, active: false })
    ]
  });
}
