<script lang="ts">
  import type { Product } from '$lib/types';
  import { fill, money, t } from '$lib/texts';
  import { inStock } from '$lib/variants';

  let { product }: { product: Product } = $props();

  const cover = $derived(product.images?.[0] ?? null);
  const currency = $derived(product.priceRange?.currency ?? product.currency);
  const ranged = $derived(!!product.priceRange && product.priceRange.min !== product.priceRange.max);
  const available = $derived(inStock(product.availability));
  const low = $derived(
    !product.availability.unlimited &&
      (product.availability.quantity ?? 0) > 0 &&
      (product.availability.quantity ?? 0) <= 5
  );
</script>

<a class="card" href="/p/{product.id}">
  <div class="pic">
    {#if cover}
      <img
        src={cover.url}
        alt={cover.alt ?? product.name}
        width={cover.width ?? undefined}
        height={cover.height ?? undefined}
        loading="lazy"
      />
    {/if}
    {#if product.checkout && !available}<span class="tag">{t.soldOut}</span>{/if}
  </div>
  <div class="body">
    <h3>{product.name}</h3>
    <p class="price">
      {#if product.priceRange}
        {ranged ? t.from : ''}{money(product.priceRange.min, currency)}
      {:else if product.price != null}
        {money(product.price, currency)}
      {/if}
    </p>
    <p class="meta">
      {#if !product.checkout}<span class="muted">{t.byQuote}</span>
      {:else if low}<span class="warn">{fill(t.lowStock, { count: product.availability.quantity ?? 0 })}</span>{/if}
      {#if product.hasVariants}<span class="muted">{t.hasOptions}</span>{/if}
    </p>
  </div>
</a>

<style>
  .card {
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
    text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.08);
  }
  .pic {
    position: relative;
    aspect-ratio: 1;
    background: var(--line);
  }
  .pic img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .tag {
    position: absolute;
    inset-block-start: 10px;
    inset-inline-start: 10px;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--bg);
    font-size: 0.8rem;
    font-weight: 600;
  }
  .body {
    padding: 12px 14px 14px;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
  .price {
    margin: 4px 0 0;
    font-weight: 700;
  }
  .meta {
    margin: 2px 0 0;
    display: flex;
    gap: 10px;
    font-size: 0.85rem;
  }
</style>
