<script lang="ts">
  import { page } from '$app/state';
  import { t } from '$lib/texts';
</script>

<section class="err">
  <h1>{page.status}</h1>
  <p class="muted">{page.error?.message}</p>
  <a class="btn" href="/">{t.backToShop}</a>
</section>

<style>
  .err {
    text-align: center;
    padding: 48px 0;
  }
</style>
