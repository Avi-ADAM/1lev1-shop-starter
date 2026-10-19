import { EMPTY_ADDRESS } from '$lib/address';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

const {
  arrangedChannels,
  arrangedExpiryHours,
  arrangedReport,
  checkBuyer,
  isArrangedId,
  newArrangedId,
  rateLimiter,
  shopWhatsapp
} = await import('./arranged');

describe('the switches', () => {
  it('ARRANGED_PAYMENT names the channels; empty is off', () => {
    expect(arrangedChannels('phone, WhatsApp')).toEqual(['phone', 'whatsapp']);
    expect(arrangedChannels('fax')).toEqual([]);
    expect(arrangedChannels('')).toEqual([]);
  });

  it('the WhatsApp number is digits, and the expiry stays in bounds', () => {
    expect(shopWhatsapp('+972 50-123-4567')).toBe('972501234567');
    expect(shopWhatsapp('123')).toBeNull();
    expect(arrangedExpiryHours('24')).toBe(24);
    expect(arrangedExpiryHours('0')).toBeNull();
    expect(arrangedExpiryHours('')).toBeNull();
  });
});

describe('the order id', () => {
  it('is long, random and recognisable', () => {
    const a = newArrangedId();
    expect(isArrangedId(a)).toBe(true);
    expect(a).not.toBe(newArrangedId());
    expect(isArrangedId('cs_test_123')).toBe(false);
    expect(isArrangedId('arr_short')).toBe(false);
  });
});

describe('checkBuyer', () => {
  const ok = { name: 'דנה', phone: '050-1234567' };

  it('needs a name and a phone someone can call', () => {
    expect(checkBuyer(ok)).toMatchObject({ ok: true, buyer: { name: 'דנה', email: null } });
    expect(checkBuyer({ name: 'ד', phone: '12' })).toEqual({ ok: false, reason: 'invalid', fields: ['name', 'phone'] });
    expect(checkBuyer({ ...ok, email: 'nope' })).toMatchObject({ fields: ['email'] });
  });

  it('a filled honeypot is spam', () => {
    expect(checkBuyer({ ...ok, website: 'http://x' })).toEqual({ ok: false, reason: 'spam' });
  });
});

describe('arrangedReport', () => {
  it('is the paid order with payment:"arranged" and no amount', () => {
    const report = arrangedReport({
      externalId: 'arr_x',
      displayNumber: 'K7Q4XM',
      priced: {
        lines: [
          { productId: '1', variantId: null, unitPrice: 40, quantity: 2 } as any,
          { productId: '2', variantId: '9', unitPrice: 310, quantity: 1 } as any
        ],
        items: [],
        currency: 'ILS',
        subtotal: 390,
        problems: [],
        delivery: []
      },
      delivery: { id: 'm:center:courier', kind: 'delivery', fee: 25, notes: [] },
      address: { ...EMPTY_ADDRESS, city: 'נתניה', street: 'הרצל', house: '1', apartment: '4' },
      buyer: { name: 'דנה', phone: '0501234567', email: null },
      note: null,
      locale: 'he',
      expiresInHours: 24
    });
    expect(report).toEqual({
      externalId: 'arr_x',
      payment: 'arranged',
      expiresInHours: 24,
      displayNumber: 'K7Q4XM',
      currency: 'ILS',
      buyer: { name: 'דנה', phone: '0501234567' },
      delivery: {
        preference: 'delivery',
        address: { city: 'נתניה', street: 'הרצל', house: '1', apartment: '4' },
        fee: 25,
        optionId: 'm:center:courier'
      },
      locale: 'he',
      lines: [
        { productId: '1', quantity: 2, unitPrice: 40 },
        { productId: '2', variantId: '9', quantity: 1, unitPrice: 310 }
      ]
    });
    expect('amount' in report).toBe(false);
  });
});

describe('rateLimiter', () => {
  it('lets a few through per window, then waits', () => {
    const allow = rateLimiter(2, 1000);
    expect(allow('ip', 0)).toBe(true);
    expect(allow('ip', 10)).toBe(true);
    expect(allow('ip', 20)).toBe(false);
    expect(allow('other', 20)).toBe(true);
    expect(allow('ip', 1500)).toBe(true);
  });
});
