import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { levConfig, LevError, reportOrder } from '$lib/server/lev';
import { payments } from '$lib/server/payments';

/**
 * The payment provider tells this endpoint a payment went through, and this
 * endpoint tells 1lev1 — the one place the orders key is used.
 *
 * Every failure answers non-2xx on purpose. The provider then retries (and
 * shows the failed delivery in its dashboard, where the owner sees it), and a
 * retry is always safe: 1lev1 records an order once per `externalId`, and a
 * report that was cut half-way is completed, not duplicated.
 */
export const POST: RequestHandler = async ({ request }) => {
  const outcome = await payments().parseWebhook(request);
  if (outcome.kind === 'invalid') {
    console.warn('[shop] webhook refused:', outcome.reason);
    return json({ error: outcome.reason }, { status: 400 });
  }
  if (outcome.kind === 'ignored') return json({ ignored: outcome.reason });

  const order = outcome.order;
  if (order.lines.length === 0) {
    // A payment on this account that this shop did not create.
    return json({ ignored: 'no shop lines' });
  }

  try {
    const res = await reportOrder(levConfig(), order);
    console.log(
      `[shop] order ${res.orderRef} recorded${res.duplicated ? ' (again)' : ''}${res.oversold ? ' — OVERSOLD' : ''}`
    );
    return json({ ok: true, orderRef: res.orderRef, duplicated: res.duplicated });
  } catch (e) {
    const err = e instanceof LevError ? e : new LevError(0, 'UNKNOWN', String(e));
    // The money is taken and 1lev1 did not record it: this line is the one
    // the owner must not miss.
    console.error(
      `[shop] ORDER NOT RECORDED externalId=${order.externalId} status=${err.status} code=${err.code}: ${err.message}`,
      err.details ?? ''
    );
    return json({ error: err.code, message: err.message }, { status: err.transient ? 503 : 422 });
  }
};
