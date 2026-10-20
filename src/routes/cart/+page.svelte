<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { cart } from '$lib/cart.svelte';
  import { fill, money, t, LANG } from '$lib/texts';
  import type { CartProblem, DeliveryChoice, PricedCart } from '$lib/server/cart';
  import type { DeliveryState } from '$lib/server/delivery';
  import { EMPTY_ADDRESS, missingForDelivery, type BuyerAddress } from '$lib/address';
  import type { Locality } from '$lib/types';

  type Cart = PricedCart & { shipping?: DeliveryState };

  let { data } = $props();

  // Back from a provider without paying (`?payment=failed|shipping`).
  const returned = page.url.searchParams.get('payment');

  let priced = $state<Cart | null>(null);
  let loading = $state(true);
  let paying = $state<string | null>(null);
  let failed = $state(false);
  let changed = $state(false);
  let delivery = $state<string>('');
  let note = $state('');

  // Order now, pay by arrangement — the buyer leaves a name and a phone.
  let arranging = $state(false);
  let buyer = $state({ name: '', phone: '', email: '', website: '' });

  // Where it goes — it decides the delivery price, so it is asked here, before payment.
  let address = $state<BuyerAddress>({ ...EMPTY_ADDRESS });
  let missing = $state<string[]>([]);
  let quoting = $state(false);
  let localities = $state<Locality[]>([]);
  let streets = $state<string[]>([]);
  let streetsFor = '';
  let badFields = $state<string[]>([]);
  let arrangedError = $state<string | null>(null);

  const choice = $derived(priced?.delivery.find((d) => d.id === delivery) ?? priced?.delivery[0] ?? null);
  const shipping = $derived(priced?.shipping ?? null);
  // The address form shows when a parcel is possible, or when one could be with a city.
  const askAddress = $derived(
    !!priced &&
      (choice?.kind === 'delivery' || !!shipping?.needsAddress || !!shipping?.outsideZones ||
        (!!shipping?.zones && priced.delivery.some((d) => d.kind === 'delivery')))
  );
  // The countries the rikma's zones name — Israel first, the rest by name.
  const countries = $derived.by(() => {
    const list = new Set<string>(['IL']);
    for (const z of data.shipping?.zones ?? []) for (const c of z.countries) list.add(c);
    return [...list];
  });
  const regionNames = (() => {
    try {
      return new Intl.DisplayNames([LANG], { type: 'region' });
    } catch {
      return null;
    }
  })();
  const countryName = (c: string) => regionNames?.of(c) ?? c;
  const locality = $derived(localities.find((l) => l.name === address.city.trim()) ?? null);
  const cityOptions = $derived.by(() => {
    const q = address.city.trim();
    if (q.length < 1) return [];
    return localities.filter((l) => l.name.startsWith(q) || (l.nameEn ?? '').toLowerCase().startsWith(q.toLowerCase())).slice(0, 40);
  });
  const streetOptions = $derived.by(() => {
    const q = address.street.trim();
    return (q ? streets.filter((s) => s.includes(q)) : streets).slice(0, 40);
  });

  function choiceLabel(d: DeliveryChoice): string {
    if (d.kind === 'pickup' && d.pickupPoint) return fill(t.shipPickupAt, { name: d.pickupPoint.name });
    return d.name || t.deliveryKinds[d.kind] || d.kind;
  }
  function etaText(d: DeliveryChoice): string {
    const min = d.etaMinDays ?? null;
    const max = d.etaMaxDays ?? null;
    if (min === null && max === null) return '';
    if (min !== null && max !== null && min !== max) return fill(t.shipEtaRange, { min, max });
    return fill(t.shipEtaDays, { days: (max ?? min) as number });
  }
  function dateText(iso: string): string {
    return new Intl.DateTimeFormat(LANG === 'he' ? 'he-IL' : 'en', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
  }
  const FIELD_LABEL: Record<string, string> = { city: t.shipCity, street: t.shipStreet, house: t.shipHouse, zip: t.shipZip };

  async function loadLocalities() {
    if (localities.length) return;
    try {
      const res = await fetch('/api/places');
      if (res.ok) localities = (await res.json())?.cities ?? [];
    } catch {
      /* the city is typed by hand */
    }
  }
  $effect(() => {
    if (askAddress && address.country === 'IL') loadLocalities();
  });
  $effect(() => {
    const code = locality?.code ?? '';
    if (!code || code === streetsFor) return;
    streetsFor = code;
    streets = [];
    fetch(`/api/places?city=${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (streetsFor === code) streets = b?.streets ?? [];
      })
      .catch(() => {});
  });

  // A city, country or postal code that changed re-prices the delivery.
  let quoteKey = 'IL||';
  let quoteTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const key = [address.country, address.city.trim(), address.zip.trim()].join('|');
    if (!priced || key === quoteKey) return;
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(() => {
      quoteKey = key;
      reprice();
    }, 450);
  });
  const total = $derived(priced ? Math.round((priced.subtotal + (choice?.fee ?? 0)) * 100) / 100 : 0);

  // Until the buyer picks a way themselves, the first one offered is theirs —
  // so a courier that appears once the city is known replaces a default pickup.
  let picked = false;
  function take(next: Cart) {
    priced = next;
    if (!picked || !next.delivery.some((d) => d.id === delivery)) delivery = next.delivery[0]?.id ?? '';
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
    quoting = true;
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart.items, address })
      });
      if (res.ok) take(await res.json());
    } finally {
      loading = false;
      quoting = false;
    }
  }

  /** Before any payment: a parcel needs a full address. */
  function addressReady(): boolean {
    missing = choice?.kind === 'delivery' ? missingForDelivery(address) : [];
    return missing.length === 0;
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
    if (!addressReady()) return;
    paying = provider;
    failed = false;
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.items,
          delivery: choice?.id,
          expectedDeliveryFee: choice?.fee,
          address: choice?.kind === 'delivery' ? address : null,
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
      } else if (res.status === 400 && body?.reason === 'address') {
        missing = body.fields ?? [];
      } else {
        failed = true;
      }
    } catch {
      failed = true;
    }
    paying = null;
  }

  async function sendArranged(e: SubmitEvent) {
    e.preventDefault();
    if (!priced || paying) return;
    if (!addressReady()) return;
    paying = 'arranged';
    badFields = [];
    arrangedError = null;
    try {
      const res = await fetch('/api/arranged', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.items,
          delivery: choice?.id,
          expectedDeliveryFee: choice?.fee,
          address: choice?.kind === 'delivery' ? address : null,
          note,
          buyer,
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
        // The notice at the top is out of sight from here; say it by the button.
        arrangedError = t.cartChanged;
      } else if (res.status === 400 && body?.reason === 'invalid') {
        badFields = body.fields ?? [];
        const addr = badFields.filter((f) => f in FIELD_LABEL);
        if (addr.length) missing = addr;
        arrangedError = t.arrangedInvalid;
      } else if (res.status === 429) {
        arrangedError = t.arrangedTooMany;
      } else {
        arrangedError = t.arrangedFailed;
      }
    } catch {
      arrangedError = t.arrangedFailed;
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
        {#if askAddress}
          <fieldset class="address" aria-busy={quoting}>
            <legend>{t.shipAddress}</legend>
            {#if countries.length > 1}
              <label class="field">
                <span>{t.shipCountry}</span>
                <select bind:value={address.country}>
                  {#each countries as c (c)}<option value={c}>{countryName(c)}</option>{/each}
                </select>
              </label>
            {/if}
            <label class="field" class:bad={missing.includes('city')}>
              <span>{t.shipCity}</span>
              <input autocomplete="address-level2" maxlength="120" list="ship-cities" bind:value={address.city} />
              <datalist id="ship-cities">
                {#each cityOptions as l (l.code)}<option value={l.name}></option>{/each}
              </datalist>
            </label>
            <div class="row2">
              <label class="field grow" class:bad={missing.includes('street')}>
                <span>{t.shipStreet}</span>
                <input autocomplete="address-line1" maxlength="160" list="ship-streets" bind:value={address.street} />
                <datalist id="ship-streets">
                  {#each streetOptions as s (s)}<option value={s}></option>{/each}
                </datalist>
              </label>
              <label class="field small" class:bad={missing.includes('house')}>
                <span>{t.shipHouse}</span>
                <input inputmode="numeric" maxlength="20" bind:value={address.house} />
              </label>
            </div>
            <div class="row3">
              <label class="field"><span>{t.shipApartment}</span><input maxlength="20" bind:value={address.apartment} /></label>
              <label class="field"><span>{t.shipFloor}</span><input maxlength="20" bind:value={address.floor} /></label>
              <label class="field"><span>{t.shipEntrance}</span><input maxlength="20" bind:value={address.entrance} /></label>
            </div>
            <label class="field" class:bad={missing.includes('zip')}>
              <span>{t.shipZip}</span>
              <input autocomplete="postal-code" inputmode="numeric" maxlength="12" bind:value={address.zip} />
            </label>
            <label class="field">
              <span>{t.shipNotes}</span>
              <input maxlength="200" placeholder={t.shipNotesPlaceholder} bind:value={address.notes} />
            </label>
            {#if missing.length}
              <p class="danger" role="alert">{fill(t.shipMissing, { fields: missing.map((f) => FIELD_LABEL[f] ?? f).join(', ') })}</p>
            {/if}
          </fieldset>
        {/if}

        <fieldset>
          <legend>{t.delivery}</legend>
          {#if quoting}<p class="muted note" role="status">{t.shipQuoting}</p>{/if}
          {#if shipping?.needsAddress}<p class="muted note">{t.shipNeedsAddress}</p>{/if}
          {#if shipping?.outsideZones}<p class="warn note">{t.shipOutside}</p>{/if}
          {#each priced.delivery as d (d.id)}
            <label class="radio">
              <input type="radio" name="delivery" value={d.id} bind:group={delivery} onchange={() => (picked = true)} />
              <span>
                {choiceLabel(d)}
                <span class="muted">· {d.fee > 0 ? money(d.fee, priced.currency) : t.free}</span>
                {#if etaText(d)}<span class="muted note">{etaText(d)}</span>{/if}
                {#if d.nextDispatch}<span class="muted note">{fill(t.shipDispatch, { date: dateText(d.nextDispatch) })}</span>{/if}
                {#if d.pickupPoint}
                  {#if d.pickupPoint.address || d.pickupPoint.city}<span class="muted note">{[d.pickupPoint.address, d.pickupPoint.city].filter(Boolean).join(', ')}</span>{/if}
                  {#if d.pickupPoint.hours}<span class="muted note">{d.pickupPoint.hours}</span>{/if}
                {/if}
                {#if d.freeOverRemaining}<span class="note accent">{fill(t.shipFreeIn, { amount: money(d.freeOverRemaining, priced.currency) })}</span>{/if}
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

        {#if data.arranged}
          {#if !arranging}
            <button
              class="btn pay arranged"
              class:quiet={data.providers.length > 0}
              type="button"
              disabled={!!paying || loading}
              onclick={() => (arranging = true)}
            >
              {t.payArranged}
            </button>
          {:else}
            <form class="arranged-form" onsubmit={sendArranged}>
              <p class="muted">{t.arrangedIntro}</p>
              <label class="field" class:bad={badFields.includes('name')}>
                <span>{t.arrangedName}</span>
                <input required autocomplete="name" maxlength="120" bind:value={buyer.name} />
              </label>
              <label class="field" class:bad={badFields.includes('phone')}>
                <span>{t.arrangedPhone}</span>
                <input required type="tel" autocomplete="tel" maxlength="40" bind:value={buyer.phone} />
              </label>
              <label class="field" class:bad={badFields.includes('email')}>
                <span>{t.arrangedEmail}</span>
                <input type="email" autocomplete="email" maxlength="200" bind:value={buyer.email} />
              </label>
              <!-- A field people never see; a form-filling bot does (the honeypot). -->
              <label class="hp" aria-hidden="true">
                Website
                <input tabindex="-1" autocomplete="off" bind:value={buyer.website} />
              </label>
              <button class="btn pay" type="submit" disabled={!!paying || loading}>
                {paying === 'arranged' ? t.arrangedSending : t.arrangedSubmit}
              </button>
              {#if arrangedError}<p class="danger" role="alert">{arrangedError}</p>{/if}
            </form>
          {/if}
        {:else if data.providers.length === 0}
          <p class="muted" role="status">{t.noPayment}</p>
        {/if}
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
  .accent {
    color: var(--accent, inherit);
    font-weight: 600;
  }
  .address[aria-busy='true'] {
    opacity: 0.85;
  }
  .row2 {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 96px;
    gap: 8px;
  }
  .row3 {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .grow,
  .small {
    min-width: 0;
  }
  /* An input's default width (its `size`) would push past a narrow column. */
  .address input,
  .address select,
  .arranged-form .field input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
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
  /* Beside a card button, arranging is the second way, not the first. */
  .pay.arranged.quiet {
    margin-top: 8px;
    background: none;
    color: inherit;
    border: 1px solid var(--line);
  }
  .arranged-form {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }
  .address .field.bad input,
  .arranged-form .field.bad input {
    border-color: var(--danger, #c0392b);
  }
  /* Clipped in place, not pushed off-screen: in RTL a far negative `left`
     is scrollable and widens the page by thousands of pixels. */
  .hp {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
