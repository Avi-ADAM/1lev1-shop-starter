<script lang="ts">
  import '../app.css';
  import { cart } from '$lib/cart.svelte';
  import { t } from '$lib/texts';

  let { data, children } = $props();
  const title = $derived(data.rikma?.name ?? t.shopTitle);
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<header class="top">
  <div class="wrap bar">
    <a class="brand" href="/">{title}</a>
    <a class="cart" href="/cart" aria-label="{t.cart} ({cart.count})">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M4 7h16l-1.6 12.2a1 1 0 0 1-1 .8H6.6a1 1 0 0 1-1-.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
        <path d="M8.5 7a3.5 3.5 0 0 1 7 0" fill="none" stroke="currentColor" stroke-width="1.8" />
      </svg>
      <span>{t.cart}</span>
      {#if cart.count > 0}<span class="badge">{cart.count}</span>{/if}
    </a>
  </div>
</header>

<main class="wrap">
  {#if data.setupError}
    <p class="notice danger" role="alert">{data.setupError}</p>
  {/if}
  {@render children()}
</main>

<footer class="wrap foot">
  <a href="https://www.1lev1.com" class="muted">{t.poweredBy}</a>
</footer>

<style>
  .top {
    position: sticky;
    top: 0;
    z-index: 10;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 60px;
  }
  .brand {
    font-weight: 700;
    font-size: 1.15rem;
    text-decoration: none;
  }
  .cart {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 8px;
    text-decoration: none;
  }
  .badge {
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 0.8rem;
    font-weight: 700;
    display: inline-grid;
    place-items: center;
  }
  main {
    padding-block: 24px 48px;
    min-height: 70vh;
  }
  .foot {
    padding-block: 24px;
    border-top: 1px solid var(--line);
    font-size: 0.875rem;
  }
</style>
