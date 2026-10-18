<script lang="ts">
  import ProductCard from '$lib/components/ProductCard.svelte';
  import { t } from '$lib/texts';

  let { data } = $props();

  const products = $derived(data.list?.data ?? []);
  const pagination = $derived(data.list?.meta?.pagination ?? null);
  const filtered = $derived(
    !!data.filters.category || !!data.filters.q || Object.keys(data.filters.options).length > 0
  );

  /** Same filters, another page. */
  function pageHref(page: number): string {
    const qs = new URLSearchParams();
    if (data.filters.category) qs.set('category', data.filters.category);
    if (data.filters.q) qs.set('q', data.filters.q);
    for (const [k, v] of Object.entries(data.filters.options)) qs.set(`option.${k}`, v);
    if (page > 1) qs.set('page', String(page));
    const s = qs.toString();
    return s ? `/?${s}` : '/';
  }
</script>

<h1 class="sr-only">{t.allProducts}</h1>

<!-- A plain GET form: filtering works before (and without) JavaScript. -->
<form class="filters" method="GET" data-sveltekit-keepfocus>
  <label class="search">
    <span class="sr-only">{t.search}</span>
    <input type="search" name="q" value={data.filters.q} placeholder={t.searchPlaceholder} />
  </label>

  {#if data.categories.length > 0}
    <label>
      <span class="sr-only">{t.filterBy}</span>
      <select name="category" value={data.filters.category} onchange={(e) => e.currentTarget.form?.requestSubmit()}>
        <option value="">{t.allProducts}</option>
        {#each data.categories as c (c.id)}
          <option value={c.id}>{c.name}</option>
        {/each}
      </select>
    </label>
  {/if}

  {#each data.axes as axis (axis.key)}
    <label>
      <span class="sr-only">{axis.name ?? axis.key}</span>
      <select
        name="option.{axis.key}"
        value={data.filters.options[axis.key] ?? ''}
        onchange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">{axis.name ?? axis.key}</option>
        {#each axis.values as v (v.value)}
          <option value={v.value}>{v.label ?? v.value}</option>
        {/each}
      </select>
    </label>
  {/each}

  <button class="btn" type="submit">{t.search}</button>
  {#if filtered}<a class="btn ghost" href="/">{t.clear}</a>{/if}
</form>

{#if products.length === 0}
  <p class="muted empty">{filtered ? t.emptyFiltered : t.empty}</p>
{:else}
  <ul class="grid">
    {#each products as product (product.id)}
      <li><ProductCard {product} /></li>
    {/each}
  </ul>
{/if}

{#if pagination && pagination.pages > 1}
  <nav class="pages" aria-label="pagination">
    {#if pagination.page > 1}
      <a class="btn ghost" href={pageHref(pagination.page - 1)}>{t.prev}</a>
    {/if}
    <span class="muted">{pagination.page} / {pagination.pages}</span>
    {#if pagination.page < pagination.pages}
      <a class="btn ghost" href={pageHref(pagination.page + 1)}>{t.next}</a>
    {/if}
  </nav>
{/if}

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
  }
  .search {
    flex: 1 1 220px;
    display: flex;
  }
  .search input {
    width: 100%;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
  }
  @media (max-width: 480px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
  }
  .empty {
    padding: 48px 0;
    text-align: center;
  }
  .pages {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    margin-top: 28px;
  }
</style>
