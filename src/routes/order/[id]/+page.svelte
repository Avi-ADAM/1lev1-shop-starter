<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { cart } from '$lib/cart.svelte';
  import { fill, money, t } from '$lib/texts';

  let { data } = $props();

  const paid = $derived(data.state === 'recorded' || data.state === 'recording');
  const order = $derived(data.order);

  // Paid: the cart did its job. Recording: look again a few times — the
  // provider's notice to the server is usually a second or two behind.
  onMount(() => {
    let tries = 0;
    const timer = setInterval(() => {
      if (data.state !== 'recording' || ++tries > 20) return clearInterval(timer);
      invalidateAll();
    }, 3000);
    return () => clearInterval(timer);
  });

  $effect(() => {
    if (paid) cart.clear();
  });
</script>

<svelte:head><title>{paid ? t.orderTitle : t.cart}</title></svelte:head>

{#if paid}
  <section class="done">
    <div class="check" aria-hidden="true">✓</div>
    <h1>{t.orderTitle}</h1>

    {#if order}
      <p class="num">{fill(t.orderNumber, { number: order.displayNumber ?? order.orderId ?? '' })}</p>
      <p class="status">{t.orderStatus[order.status] ?? order.status}</p>

      <h2>{t.orderLines}</h2>
      <ul class="lines">
        {#each order.lines as line, i (i)}
          <li>
            <span>
              {line.name}{#if line.optionLabel}<span class="muted"> · {line.optionLabel}</span>{/if}
              <span class="muted"> × {line.quantity}</span>
            </span>
            <span>{money((line.unitPrice ?? 0) * (line.quantity ?? 0), order.currency)}</span>
          </li>
        {/each}
      </ul>
      {#if order.total != null}
        <p class="total"><span>{t.total}</span><strong>{money(order.total, order.currency)}</strong></p>
      {/if}
    {:else}
      <p class="muted" role="status">{t.orderRecording}</p>
    {/if}

    <a class="btn" href="/">{t.backToShop}</a>
  </section>
{:else}
  <section class="done">
    <h1>{data.state === 'unknown' ? t.orderUnknown : data.state === 'pending' ? t.orderPending : t.orderUnpaid}</h1>
    <a class="btn" href="/cart">{t.backToCart}</a>
  </section>
{/if}

<style>
  .done {
    max-width: 560px;
    margin: 24px auto;
    text-align: center;
  }
  .check {
    width: 64px;
    height: 64px;
    margin: 0 auto 12px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    display: grid;
    place-items: center;
    font-size: 2rem;
    font-weight: 700;
  }
  h1 {
    margin: 0 0 8px;
  }
  .num {
    font-size: 1.15rem;
    font-weight: 600;
    margin: 0;
  }
  .status {
    margin: 4px 0 24px;
  }
  h2 {
    font-size: 1rem;
    text-align: start;
  }
  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
    text-align: start;
  }
  .lines li,
  .total {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .total {
    border: 0;
    margin: 4px 0 24px;
  }
</style>
