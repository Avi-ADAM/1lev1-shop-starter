<script lang="ts">
  import type { Promotion } from '$lib/types';
  import { describePromotion, untilLabel } from '$lib/promo';
  import { t } from '$lib/texts';

  let { promotions, currency }: { promotions: Promotion[]; currency: string | null } = $props();

  const items = $derived(
    promotions
      .map((p) => ({ id: p.id, name: p.name, rule: describePromotion(p, currency), until: untilLabel(p) }))
      .filter((p) => p.name || p.rule)
  );
</script>

{#if items.length}
  <section class="promo" aria-label={t.promoBanner}>
    <ul class="wrap">
      {#each items as p (p.id)}
        <li>
          {#if p.name}<strong>{p.name}</strong>{/if}
          {#if p.rule}<span>{p.rule}</span>{/if}
          {#if p.until}<span class="until">{p.until}</span>{/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .promo {
    background: var(--accent);
    color: var(--accent-ink);
  }
  ul {
    list-style: none;
    margin: 0;
    padding-block: 8px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px 24px;
    font-size: 0.92rem;
  }
  li {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0 8px;
    align-items: baseline;
  }
  .until {
    opacity: 0.85;
    font-size: 0.85rem;
  }
</style>
