<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { cart } from '$lib/cart.svelte';
  import { fill, money, t } from '$lib/texts';
  import type { CartProblem, PricedCart } from '$lib/server/cart';

  let { data } = $props();

  // Back from a provider without paying (`?payment=failed|shipping`).
  const returned = page.url.searchParams.get('payment');

  let priced = $state<PricedCart | null>(null);
  let loading = $state(true);
  let paying = $state<string | null>(null);
  let failed = $state(false);
  let changed = $state(false);
  let delivery = $state<string>('');
  let note = $state('');

  const choice = $derived(priced?.delivery.find((d) => d.kind === delivery) ?? priced?.delivery[0] ?? null);
  const total = $derived(priced ? Math.round((priced.subtotal + (choice?.fee ?? 0)) * 100) / 100 : 0);

  function take(next: PricedCart) {
    priced = next;
    if (!next.delivery.some((d) => d.kind === delivery)) delivery = next.delivery[0]?.kind ?? '';
    // The server's cart is the truth: drop what is gone, clamp what is short.
    const same =
      next.items.length === cart.items.length &&
      next.items.every((i, n) => {
        const c = cart.items[n];
        return c && c.productId === i.productId && (c.variantId ?? null) === i.variantId && c.quantity === i.quantity;
      });
    if (!same) cart.replace(next.items);
  }

  async function reprice() {
    loading = true;
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart.items })
      });
      if (res.ok) take(await res.json());
    } finally {
      loading = false;
    }
  }

  onMount(reprice);

  let timer: ReturnType<typeof setTimeout> | undefined;
  function setQty(productId: string, variantId: string | null, q: number) {
    cart.setQuantity(productId, variantId, q);
    changed = false;
    clearTimeout(timer);
    timer = setTimeout(reprice, 350);
  }

  function remove(productId: string, variantId: string | null) {
    cart.remove(productId, variantId);
    reprice();
  }

  async function pay(provider: string) {
    if (!priced || paying) return;
    paying = provider;
    failed = false;
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.items,
          delivery: choice?.kind,
          note,
          provider,
          expectedSubtotal: priced.subtotal
        })
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.redirectUrl) {
        window.location.href = body.redirectUrl;
        return;
      }
      if (res.status === 409 && body?.cart) {
        take(body.cart);
        changed = true;
      } else {
        failed = true;
      }
    } catch {
      failed = true;
    }
    paying = null;
  }

  function problemText(p: CartProblem): string {
    const template = t.problems[p.kind] ?? '';
    return fill(template, {
      name: 'name' in p ? p.name : '',
      count: 'quantity' in p ? p.quantity : ''
    });
  }
</script>

<svelte:head><title>{t.cart}</title></svelte:head>

<h1>{t.cart}</h1>

{#if changed}<p class="notice warn" role="status">{t.cartChanged}</p>{/if}
{#if returned === 'shipping'}
  <p class="notice warn" role="status">{t.shippingRefused}</p>
{:else if returned === 'failed'}
  <p class="notice warn" role="status">{t.paymentFailed}</p>
{/if}
{#if priced?.problems.length}
  <ul class="problems" role="status">
    {#each priced.problems as p, i (i)}<li class="warn">{problemText(p)}</li>{/each}
  </ul>
{/if}

{#if cart.items.length === 0 && !loading}
  <p class="muted">{t.cartEmpty}</p>
  <a class="btn" href="/">{t.backToShop}</a>
{:else if priced}
  <div class="layout">
    <ul class="lines" aria-busy={loading}>
      {#each priced.lines as line (line.productId + ':' + (line.variantId ?? ''))}
        <li class="line">
          <a class="thumb" href="/p/{line.productId}">
            {#if line.image}<img src={line.image.url} alt="" loading="lazy" />{/if}
          </a>
          <div class="what">
            <a href="/p/{line.productId}"><strong>{line.name}</strong></a>
            {#if line.optionLabel}<div class="muted">{line.optionLabel}</div>{/if}
            <div class="muted">{money(line.unitPrice, priced.currency)}</div>
          </div>
          <div class="how">
            <label class="qty">
              <span class="sr-only">{t.quantity}</span>
              <button
                type="button"
                aria-label="-"
                disabled={line.quantity <= line.minQuantity}
                onclick={() => setQty(line.productId, line.variantId, line.quantity - 1)}>−</button
              >
              <span class="n">{line.quantity}</span>
              <button
                type="button"
                aria-label="+"
                disabled={line.quantity >= line.maxQuantity}
                onclick={() => setQty(line.productId, line.variantId, line.quantity + 1)}>+</button
              >
            </label>
            <strong>{money(line.total, priced.currency)}</strong>
            <button type="button" class="link muted" onclick={() => remove(line.productId, line.variantId)}>
              {t.remove}
            </button>
          </div>
        </li>
      {/each}
    </ul>

    {#if priced.lines.length > 0}
      <aside class="summary">
        <fieldset>
          <legend>{t.delivery}</legend>
          {#each priced.delivery as d (d.kind)}
            <label class="radio">
              <input type="radio" name="delivery" value={d.kind} bind:group={delivery} />
              <span>
                {t.deliveryKinds[d.kind] ?? d.kind}
                <span class="muted">· {d.fee > 0 ? money(d.fee, priced.currency) : t.free}</span>
                {#each d.notes as n}<span class="muted note">{n}</span>{/each}
              </span>
            </label>
          {/each}
        </fieldset>

        <label class="field">
          <span>{t.note}</span>
          <textarea rows="2" maxlength="500" placeholder={t.notePlaceholder} bind:value={note}></textarea>
        </label>

        <dl>
          <div><dt>{t.subtotal}</dt><dd>{money(priced.subtotal, priced.currency)}</dd></div>
          {#if choice && choice.fee > 0}
            <div><dt>{t.deliveryFee}</dt><dd>{money(choice.fee, priced.currency)}</dd></div>
          {/if}
          <div class="sum"><dt>{t.total}</dt><dd>{money(total, priced.currency)}</dd></div>
        </dl>

        {#each data.providers as provider (provider)}
          <button
            class="btn pay {provider}"
            type="button"
            disabled={!!paying || loading}
            onclick={() => pay(provider)}
          >
            {paying === provider ? t.paying : data.providers.length > 1 ? t.payWith[provider] : t.pay}
          </button>
        {/each}
        {#if failed}<p class="danger" role="alert">{t.checkoutFailed}</p>{/if}
      </aside>
    {/if}
  </div>
{/if}

<style>
  h1 {
    margin: 0 0 16px;
  }
  .problems {
    margin: 0 0 16px;
    padding-inline-start: 18px;
  }
  .layout {
    display: grid;
    gap: 24px;
    grid-template-columns: minmax(0, 1fr) 340px;
    align-items: start;
  }
  @media (max-width: 820px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .lines[aria-busy='true'] {
    opacity: 0.6;
  }
  .line {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  @media (max-width: 480px) {
    .line {
      grid-template-columns: 64px minmax(0, 1fr);
    }
    .how {
      grid-column: 1 / -1;
    }
  }
  .thumb {
    width: 72px;
    height: 72px;
    border-radius: 10px;
    overflow: hidden;
    background: var(--line);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .what a {
    text-decoration: none;
  }
  .how {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: flex-end;
  }
  .qty {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 999px;
  }
  .qty button {
    width: 40px;
    height: 40px;
    border: 0;
    background: none;
    color: inherit;
    font-size: 1.1rem;
    cursor: pointer;
  }
  .qty button:disabled {
    opacity: 0.3;
  }
  .n {
    min-width: 24px;
    text-align: center;
  }
  .link {
    background: none;
    border: 0;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
    min-height: 44px;
  }
  .summary {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 16px;
    position: sticky;
    top: 76px;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 12px;
  }
  legend {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .radio {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 6px 0;
    cursor: pointer;
  }
  .radio input {
    min-height: auto;
    margin-top: 5px;
  }
  .note {
    display: block;
    font-size: 0.85rem;
  }
  .field {
    display: grid;
    gap: 4px;
    margin-bottom: 12px;
  }
  textarea {
    resize: vertical;
  }
  dl {
    margin: 0 0 14px;
  }
  dl div {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
  }
  dt,
  dd {
    margin: 0;
  }
  .sum {
    border-top: 1px solid var(--line);
    margin-top: 6px;
    padding-top: 10px;
    font-weight: 700;
    font-size: 1.1rem;
  }
  .pay {
    width: 100%;
  }
  .pay + .pay {
    margin-top: 8px;
  }
  .pay.paypal {
    background: #ffc439;
    color: #111;
  }
</style>
