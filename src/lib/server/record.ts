import { json } from '@sveltejs/kit';
import type { OrderReport } from '$lib/types';
import { levConfig, LevError, reportOrder } from '$lib/server/lev';
import type { PaymentAdapter } from '$lib/server/payments/types';

/**
 * Tell 1lev1 a payment went through — the one place the orders key is used.
 * Safe to call again for the same payment: 1lev1 records an order once per
 * `externalId`, and a report that was cut half-way is completed, not
 * duplicated.
 */
export async function recordOrder(
  order: OrderReport
): Promise<{ ok: true; orderRef: string; duplicated: boolean } | { ok: false; error: LevError }> {
  try {
    const res = await reportOrder(levConfig(), order);
    console.log(
      `[shop] order ${res.orderRef} recorded${res.duplicated ? ' (again)' : ''}${res.oversold ? ' — OVERSOLD' : ''}`
    );
    return { ok: true, orderRef: res.orderRef, duplicated: res.duplicated };
  } catch (e) {
    const err = e instanceof LevError ? e : new LevError(0, 'UNKNOWN', String(e));
    // The money is taken and 1lev1 did not record it: this line is the one
    // the owner must not miss.
    console.error(
      `[shop] ORDER NOT RECORDED externalId=${order.externalId} status=${err.status} code=${err.code}: ${err.message}`,
      err.details ?? ''
    );
    return { ok: false, error: err };
  }
}

/**
 * A provider's webhook. Every failure answers non-2xx on purpose: the
 * provider then retries (and shows the failed delivery in its dashboard,
 * where the owner sees it), and a retry is always safe.
 */
export async function answerWebhook(adapter: PaymentAdapter, request: Request): Promise<Response> {
  let outcome;
  try {
    outcome = await adapter.parseWebhook(request);
  } catch (e) {
    // The provider's API had a bad moment while reading the payment back.
    console.error(`[shop] ${adapter.name} webhook failed:`, e);
    return json({ error: 'provider' }, { status: 503 });
  }
  if (outcome.kind === 'invalid') {
    console.warn(`[shop] ${adapter.name} webhook refused:`, outcome.reason);
    return json({ error: outcome.reason }, { status: 400 });
  }
  if (outcome.kind === 'ignored') return json({ ignored: outcome.reason });

  if (outcome.order.lines.length === 0) {
    // A payment on this account that this shop did not create.
    return json({ ignored: 'no shop lines' });
  }

  const res = await recordOrder(outcome.order);
  if (res.ok) return json(res);
  return json(
    { error: res.error.code, message: res.error.message },
    { status: res.error.transient ? 503 : 422 }
  );
}
