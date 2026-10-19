# 1lev1 shop starter

A storefront for a [1lev1](https://www.1lev1.com) rikma — ready to deploy.
You get a catalog, product pages with a gallery and a variant picker, a cart,
Stripe Checkout and/or PayPal, and a "thank you" page that shows the order's status. Your
rikma stays the backend: products, stock, orders and the partners' shares
live there. This repo holds no database and no admin panel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAvi-ADAM%2F1lev1-shop-starter&env=LEV_RIKMA_URL,LEV_ORDERS_KEY,STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET&envDescription=The%20rikma%20address%2C%20an%20orders%20key%2C%20and%20your%20Stripe%20keys&envLink=https%3A%2F%2Fgithub.com%2FAvi-ADAM%2F1lev1-shop-starter%23setup)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/Avi-ADAM/1lev1-shop-starter)

## How an order travels

```
buyer ─▶ your shop ─▶ Stripe Checkout ─▶ paid
                                          │ webhook (signed)
                                          ▼
                      your shop's server ─▶ POST /api/v1/r/<rikma>/orders
                                          │
                                          ▼
              the rikma: an order to ship, a sale per line, stock down
```

1. The cart in the browser holds product ids and counts — **never a price**.
2. "Continue to payment" asks the server, which prices the cart again from
   your rikma's catalog and opens a Stripe Checkout page. If something moved
   (a price, the stock), the buyer gets the corrected cart back to review
   instead of a charge they did not see.

   With PayPal set up too, the cart shows a button for each. PayPal charges
   only when the buyer comes back to `/api/payments/paypal/return`: the
   server captures the money there and reports the order right away; the
   PayPal webhook (`/api/payments/paypal/webhook`) is the safety net for a
   buyer who closed the tab, and the order is again read back **from
   PayPal**. `externalId` is the PayPal order id.
3. When Stripe confirms the payment it calls `/api/payments/webhook`. The
   shop checks Stripe's signature, reads the paid lines back **from Stripe**,
   and reports the order to 1lev1. This is the only place the orders key is
   used.
4. In the rikma the order shows up under **Sales management → Orders**, ready
   to ship. Each line is a sale held by the key's owner — it counts toward
   the profit split right away, with no manual confirmation.

A report is safe to repeat. 1lev1 records one order per payment
(`externalId` = Stripe's payment id), so Stripe's retries never record it
twice. If 1lev1 cannot take the order, the webhook answers with an error,
Stripe retries for up to three days, and the failed delivery is visible in
your Stripe dashboard. The server log says `ORDER NOT RECORDED` with the
reason.

## Setup

1. **In your rikma** (1lev1 → the rikma → *Sales management → Connections*):
   create an API key with **`orders:create` + `orders:read`**. It records
   sales that change the partners' balances: it belongs on the server only.
   Its owner is the member whose Stripe account receives the money.
2. **In Stripe** (Developers → Webhooks): add an endpoint
   `https://<your-site>/api/payments/webhook` with the events
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
   Copy its signing secret.
   **PayPal (optional, alongside or instead of Stripe):** at
   [developer.paypal.com](https://developer.paypal.com) → *Apps & Credentials*,
   create a REST app and copy its client id and secret. On the app, add a
   webhook `https://<your-site>/api/payments/paypal/webhook` with the events
   `CHECKOUT.ORDER.APPROVED` and `PAYMENT.CAPTURE.COMPLETED`, and copy its id.
3. **Environment variables** (Vercel/Netlify project settings, or `.env`
   locally — see `.env.example`):

   | Variable | |
   |---|---|
   | `LEV_RIKMA_URL` | `https://www.1lev1.com/api/v1/r/<your rikma>` |
   | `LEV_ORDERS_KEY` | the key from step 1 |
   | `STRIPE_SECRET_KEY` | `sk_live_…` (or `sk_test_…` to try it) |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 2 |
   | `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | optional — the PayPal app's credentials |
   | `PAYPAL_WEBHOOK_ID` | the PayPal webhook's id from step 2 |
   | `PAYPAL_ENV` | `sandbox` (default) or `live` |
   | `LEV_READ_KEY` | optional — a `products:read` key (drafts, higher rate limit) |
   | `SHOP_SITE_URL` | optional — your domain, for the payment pages' return links |
   | `SHOP_SHIPPING_COUNTRIES` | optional — `IL` by default |

4. Deploy. Buy something with a [Stripe test card](https://docs.stripe.com/testing)
   and watch it arrive in the rikma's orders.

## What sells here

Only products the API marks `checkout: true` — a fixed price, not archived.
A product sold by quote, or with a pool price, shows a link to request it on
1lev1 instead. Delivery choices are the ones **every** product in the cart
offers (as set in the rikma); the fee is the highest of them — one parcel.

## Make it yours

- **Words:** every string is in `src/lib/texts.ts`. Hebrew (RTL) by default;
  set `LANG = 'en'` for English, or add a language.
- **Look:** the colour and shape tokens at the top of `src/app.css`.
- **Another payment provider:** write an adapter next to
  `src/lib/server/payments/stripe.ts` (or `paypal.ts`) with the methods in
  `types.ts` (`createCheckout`, `parseWebhook`, `lookupPayment`,
  `ownsPaymentId`) and add it in `payments/index.ts`. Nothing else knows
  which provider is used.
- **PayPal limits:** the buyer's note is kept to 127 characters (PayPal's
  limit), and an address PayPal returns outside `SHOP_SHIPPING_COUNTRIES` is
  not charged — the buyer is sent back to the cart.
- **Refunds:** refund in Stripe or PayPal, then `POST /api/v1/r/<rikma>/orders/<ref>/cancel`
  with the same key (or cancel from the rikma's orders screen).

## Develop

```bash
npm install
cp .env.example .env   # fill it in
npm run dev
npm test               # pricing, variant picker, Stripe/PayPal checkout and order mapping
npm run check
```

Forward Stripe's webhooks to your machine with
`stripe listen --forward-to localhost:5173/api/payments/webhook`.
PayPal's return works locally with sandbox keys; its webhook needs a public
address (e.g. a tunnel) to reach you.
