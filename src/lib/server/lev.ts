import { env } from '$env/dynamic/private';
import type {
  Category,
  OrderReport,
  OrderView,
  Product,
  ProductList,
  Rikma
} from '$lib/types';

/**
 * The 1lev1 rikma API, from this shop's server.
 *
 * Reading is public: the catalog works with no key at all, and `LEV_READ_KEY`
 * only adds drafts or a higher rate limit. The orders key is a different
 * thing — it records sales that move the partners' balances — so it is read
 * here, on the server, and nowhere else. 1lev1 refuses an orders call that
 * carries an `Origin` header (a browser always sends one); a server's `fetch`
 * does not.
 */

export class LevError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null
  ) {
    super(message);
  }

  /** Worth retrying: 1lev1 or the network had a bad moment, nothing was refused. */
  get transient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export interface LevConfig {
  rikmaUrl: string;
  readKey?: string;
  ordersKey?: string;
  fetch?: typeof fetch;
}

export function levConfig(fetcher?: typeof fetch): LevConfig {
  const rikmaUrl = (env.LEV_RIKMA_URL ?? '').trim().replace(/\/+$/, '');
  if (!rikmaUrl) {
    throw new LevError(0, 'NOT_CONFIGURED', 'LEV_RIKMA_URL is not set — see .env.example');
  }
  return {
    rikmaUrl,
    readKey: env.LEV_READ_KEY?.trim() || undefined,
    ordersKey: env.LEV_ORDERS_KEY?.trim() || undefined,
    fetch: fetcher
  };
}

async function call<T>(
  cfg: LevConfig,
  path: string,
  init: { method?: string; key?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.key) headers.Authorization = `Bearer ${init.key}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await (cfg.fetch ?? fetch)(`${cfg.rikmaUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // A paid order is answered in place; a redirect would replay the POST.
      redirect: init.method === 'POST' ? 'error' : 'follow'
    });
  } catch (e) {
    throw new LevError(0, 'NETWORK', `1lev1 could not be reached: ${(e as Error).message}`);
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = json?.error ?? {};
    throw new LevError(
      res.status,
      String(err.code ?? `HTTP_${res.status}`),
      String(err.message ?? (text.slice(0, 200) || res.statusText)),
      err.details ?? null
    );
  }
  return json as T;
}

// ─── reading — the catalog ─────────────────────────────────────────────────

export interface ListParams {
  page?: number;
  limit?: number;
  category?: string;
  q?: string;
  sort?: string;
  /** `{ size: 'm' }` ⇒ `?option.size=m`. */
  options?: Record<string, string>;
}

export function listQuery(params: ListParams): string {
  const qs = new URLSearchParams();
  if (params.page && params.page > 1) qs.set('page', String(params.page));
  qs.set('limit', String(params.limit ?? 24));
  if (params.category) qs.set('category', params.category);
  if (params.q) qs.set('q', params.q);
  if (params.sort) qs.set('sort', params.sort);
  for (const [key, value] of Object.entries(params.options ?? {})) {
    if (value) qs.set(`option.${key}`, value);
  }
  return qs.toString();
}

export function listProducts(cfg: LevConfig, params: ListParams = {}): Promise<ProductList> {
  return call<ProductList>(cfg, `/products?${listQuery(params)}`, { key: cfg.readKey });
}

/** One product, with its variants (the detail call always carries them). */
export async function getProduct(cfg: LevConfig, id: string): Promise<Product | null> {
  if (!/^\d{1,12}$/.test(id)) return null;
  try {
    const res = await call<{ data: Product }>(cfg, `/products/${id}`, { key: cfg.readKey });
    return res?.data ?? null;
  } catch (e) {
    if (e instanceof LevError && e.status === 404) return null;
    throw e;
  }
}

export async function getRikma(cfg: LevConfig): Promise<Rikma> {
  const res = await call<{ data: Rikma }>(cfg, '', { key: cfg.readKey });
  return res.data;
}

export async function listCategories(cfg: LevConfig): Promise<Category[]> {
  const res = await call<{ data: Category[] }>(cfg, '/categories', { key: cfg.readKey });
  return res?.data ?? [];
}

export async function listOptions(
  cfg: LevConfig
): Promise<Array<{ key: string; name: string | null; values: Array<{ value: string; label: string | null; products: number }> }>> {
  try {
    const res = await call<{ options: any[] }>(cfg, '/options', { key: cfg.readKey });
    return res?.options ?? [];
  } catch (e) {
    // A deployment whose shop schema is not live yet has no axes to filter by.
    if (e instanceof LevError && (e.status === 404 || e.status === 503)) return [];
    throw e;
  }
}

// ─── writing — the paid order ──────────────────────────────────────────────

function ordersKeyOf(cfg: LevConfig): string {
  if (!cfg.ordersKey) {
    throw new LevError(0, 'NOT_CONFIGURED', 'LEV_ORDERS_KEY is not set — orders cannot be reported');
  }
  return cfg.ordersKey;
}

export interface OrderAccepted {
  success: true;
  duplicated: boolean;
  orderRef: string;
  orderId: string | null;
  displayNumber: string | null;
  status: string;
  oversold: boolean;
  total: number;
  currency: string | null;
}

/**
 * Report a paid order. Safe to send again: the same `externalId` with the same
 * lines answers `duplicated: true` and the same order — nothing is recorded
 * twice — so a retried payment webhook simply calls this again.
 */
export function reportOrder(cfg: LevConfig, order: OrderReport): Promise<OrderAccepted> {
  return call<OrderAccepted>(cfg, '/orders', {
    method: 'POST',
    key: ordersKeyOf(cfg),
    body: order
  });
}

/** `<rikmaId>:<externalId>` — the address of an order at 1lev1. */
export function orderRefOf(rikmaId: string, externalId: string): string {
  return `${rikmaId}:${externalId}`;
}

export async function getOrder(cfg: LevConfig, ref: string): Promise<OrderView | null> {
  try {
    return await call<OrderView>(cfg, `/orders/${encodeURIComponent(ref)}`, {
      key: ordersKeyOf(cfg)
    });
  } catch (e) {
    if (e instanceof LevError && e.status === 404) return null;
    throw e;
  }
}
