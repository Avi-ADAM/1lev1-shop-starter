<script lang="ts">
  import { cart } from '$lib/cart.svelte';
  import { fill, money, t } from '$lib/texts';
  import {
    choose as chooseValue,
    initialSelection,
    inStock,
    maxQuantityOf,
    minQuantityOf,
    shownOf,
    valueExists,
    valueState,
    type Selection
  } from '$lib/variants';

  let { data } = $props();
  const product = $derived(data.product);

  let selection = $state<Selection>({});
  let quantity = $state(1);
  let imageIndex = $state(0);
  let justAdded = $state(false);

  // A new product (client-side navigation between products) starts fresh.
  $effect.pre(() => {
    selection = initialSelection(product);
    quantity = minQuantityOf(product);
    imageIndex = 0;
  });

  const shown = $derived(shownOf(product, selection));
  const currency = $derived(product.priceRange?.currency ?? product.currency);
  const available = $derived(inStock(shown.availability));
  const max = $derived(maxQuantityOf(product, shown.availability));
  const min = $derived(minQuantityOf(product));
  const image = $derived(shown.images[Math.min(imageIndex, shown.images.length - 1)] ?? null);
  const missing = $derived(
    product.options.filter((o) => !selection[o.key]).map((o) => o.name ?? o.key)
  );
  const low = $derived(
    !shown.availability.unlimited &&
      (shown.availability.quantity ?? 0) > 0 &&
      (shown.availability.quantity ?? 0) <= 5
  );

  function choose(key: string, value: string) {
    selection = chooseValue(product, selection, key, value);
    imageIndex = 0;
  }

  function add() {
    if (!shown.ready || !available) return;
    cart.add(product.id, shown.variant?.id ?? null, Math.min(max, Math.max(min, quantity)));
    justAdded = true;
    setTimeout(() => (justAdded = false), 2500);
  }
</script>

<svelte:head>
  <title>{product.name}</title>
  {#if product.descriptionText}<meta name="description" content={product.descriptionText.slice(0, 160)} />{/if}
  {#if product.images[0]}<meta property="og:image" content={product.images[0].url} />{/if}
</svelte:head>

<a class="back muted" href="/">← {t.backToShop}</a>

<article class="product">
  <section class="gallery" aria-label="gallery">
    <div class="main-pic">
      {#if image}
        <img
          src={image.url}
          alt={image.alt ?? product.name}
          width={image.width ?? undefined}
          height={image.height ?? undefined}
        />
      {/if}
    </div>
    {#if shown.images.length > 1}
      <ul class="thumbs">
        {#each shown.images as img, i (img.url)}
          <li>
            <button
              type="button"
              class:active={i === imageIndex}
              aria-label="{i + 1} / {shown.images.length}"
              aria-pressed={i === imageIndex}
              onclick={() => (imageIndex = i)}
            >
              <img src={img.url} alt="" loading="lazy" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="info">
    <h1>{product.name}</h1>

    <p class="price">
      {#if shown.price != null}
        <strong>{money(shown.price, currency)}</strong>
        {#if shown.compareAtPrice && shown.compareAtPrice > (shown.price ?? 0)}
          <s class="muted">{money(shown.compareAtPrice, currency)}</s>
        {/if}
      {:else if product.priceRange}
        <strong>{t.from}{money(product.priceRange.min, currency)}</strong>
      {/if}
      {#if product.unit}<span class="muted">{fill(t.unit, { unit: product.unit })}</span>{/if}
    </p>

    {#each product.options as axis (axis.key)}
      <fieldset class="axis">
        <legend>{axis.name ?? axis.key}</legend>
        <div class="values">
          {#each axis.values as v (v.value)}
            {@const state = valueState(product, selection, axis.key, v.value)}
            {#if valueExists(product, axis.key, v.value)}
              <button
                type="button"
                class="value"
                class:chosen={selection[axis.key] === v.value}
                class:sold={state === 'soldOut'}
                class:elsewhere={state === 'none'}
                aria-pressed={selection[axis.key] === v.value}
                onclick={() => choose(axis.key, v.value)}
              >
                {#if v.hex}<span class="swatch" style:background={v.hex}></span>{/if}
                {v.label ?? v.value}
              </button>
            {/if}
          {/each}
        </div>
      </fieldset>
    {/each}

    {#if product.checkout}
      <p class="stock" aria-live="polite">
        {#if !shown.ready && missing.length}
          <span class="muted">{fill(t.chooseOptions, { names: missing.join(', ') })}</span>
        {:else if !available}
          <span class="danger">{t.soldOut}</span>
        {:else if low}
          <span class="warn">{fill(t.lowStock, { count: shown.availability.quantity ?? 0 })}</span>
        {:else}
          <span class="muted">{t.inStock}</span>
        {/if}
      </p>

      <div class="buy">
        <label class="qty">
          <span class="sr-only">{t.quantity}</span>
          <button type="button" aria-label="-" onclick={() => (quantity = Math.max(min, quantity - 1))}>−</button>
          <input type="number" inputmode="numeric" {min} max={max} bind:value={quantity} />
          <button type="button" aria-label="+" onclick={() => (quantity = Math.min(max, quantity + 1))}>+</button>
        </label>
        <button class="btn add" type="button" disabled={!shown.ready || !available} onclick={add}>
          {justAdded ? t.added : t.addToCart}
        </button>
      </div>
      {#if justAdded}<p><a href="/cart">{t.cart} →</a></p>{/if}
    {:else}
      <p class="notice">
        {t.notInShop}
        {#if product.buyUrl}— <a href={product.buyUrl} rel="noopener">{t.requestQuote}</a>{/if}
      </p>
    {/if}

    {#if product.descriptionHtml}
      <!-- 1lev1 rebuilds this HTML from an allow-list of bare tags — no attributes, no scripts. -->
      <div class="desc">{@html product.descriptionHtml}</div>
    {:else if product.descriptionText}
      <p class="desc">{product.descriptionText}</p>
    {/if}

    {#if product.delivery.length || product.leadTimeHours}
      <section class="delivery">
        <h2>{t.delivery}</h2>
        <ul>
          {#each product.delivery as d (d.kind)}
            <li>
              <strong>{t.deliveryKinds[d.kind] ?? d.kind}</strong>
              {#if d.fee != null}· {d.fee > 0 ? money(d.fee, d.currency ?? currency) : t.free}{/if}
              {#if d.note}<span class="muted"> — {d.note}</span>{/if}
            </li>
          {/each}
          {#if product.leadTimeHours}
            <li class="muted">{fill(t.leadTime, { days: Math.max(1, Math.round(product.leadTimeHours / 24)) })}</li>
          {/if}
        </ul>
      </section>
    {/if}
  </section>
</article>

<style>
  .back {
    display: inline-block;
    margin-bottom: 16px;
    text-decoration: none;
  }
  .product {
    display: grid;
    gap: 32px;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    align-items: start;
  }
  @media (max-width: 760px) {
    .product {
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }
  }
  .main-pic {
    aspect-ratio: 1;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--line);
  }
  .main-pic img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .thumbs {
    list-style: none;
    padding: 0;
    margin: 10px 0 0;
    display: flex;
    gap: 8px;
    overflow-x: auto;
  }
  .thumbs button {
    width: 64px;
    height: 64px;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    background: var(--line);
  }
  .thumbs button.active {
    border-color: var(--accent);
  }
  .thumbs img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  h1 {
    margin: 0 0 6px;
    font-size: clamp(1.4rem, 3vw, 2rem);
    line-height: 1.2;
  }
  .price {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: baseline;
    font-size: 1.25rem;
    margin: 0 0 16px;
  }
  .price span {
    font-size: 0.9rem;
  }
  .axis {
    border: 0;
    padding: 0;
    margin: 0 0 14px;
  }
  legend {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .values {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .value {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }
  .value.chosen {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .value.sold {
    color: var(--muted);
    text-decoration: line-through;
  }
  /* Not with the other choices — a click moves to a variant that has it. */
  .value.elsewhere {
    border-style: dashed;
    color: var(--muted);
  }
  .swatch {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid var(--line);
  }
  .stock {
    margin: 4px 0 10px;
  }
  .buy {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .qty {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
  }
  .qty button {
    width: 44px;
    height: 44px;
    border: 0;
    background: none;
    color: inherit;
    font-size: 1.2rem;
    cursor: pointer;
  }
  .qty input {
    width: 52px;
    min-height: 40px;
    border: 0;
    text-align: center;
    padding: 0;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .add {
    flex: 1 1 180px;
  }
  .desc {
    margin-top: 24px;
  }
  .delivery h2 {
    font-size: 1rem;
    margin: 24px 0 6px;
  }
  .delivery ul {
    margin: 0;
    padding-inline-start: 18px;
  }
</style>
