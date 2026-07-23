# Owner Action Plan — Checkout (T7) & Mercado Pago Payments (T8)

This is your hands-on checklist. You do not need to read any code. Just use the store like a shopper, try a few "cheats," and check a couple of things. Tick each box as you go.

> Want the under-the-hood technical detail? See `tasks/human-review-T7-T8.md`. This file stands on its own — you don't need it.

**Two things are blocked until you supply keys** (both called out below, don't worry if you skip them today):
- Live payment testing needs your **Mercado Pago sandbox keys** (Phase 4).
- The email test needs a **Resend email key** — but there's a no-key preview mode you can use instead (Phase 5).

**Handy links while you work:**
- Store front: **http://localhost:3000**
- Database viewer (Supabase Studio): **http://127.0.0.1:54323** → click **Table Editor** in the left sidebar.

---

## Phase 1 — 15-minute read: what was built and what the robots already checked

No actions here, just read so you know what you're signing off on.

**Checkout (T7) — what it does & what testing found:**
- Guest checkout: shopper fills contact + shipping address, sees an order summary, can type a discount code, picks nothing to pay yet (payment is T8), and gets a confirmation page.
- The order total is always recalculated on the server from the real catalog price and real stock — a shopper editing their browser cannot change what they're charged.
- It won't let two people buy the last unit of something, won't create empty orders, and won't create a duplicate order if you double-click.
- Automated review gave it a strong pass (9/10). One real bug was caught and fixed during testing: a discount code like `AHORRA_0` was wrongly matching the real `AHORRA10` — now fixed.

**Mercado Pago payments (T8) — what it does & what testing found:**
- Card, OXXO, SPEI, and MP wallet. OXXO/SPEI show a "pending" state with payment instructions until the customer pays.
- When Mercado Pago tells us a payment happened, we independently re-check the real amount with Mercado Pago (we never trust the message at face value), confirm it matches the order total to the exact cent, and only then mark the order paid.
- A fake or replayed payment message is rejected. A repeated message never double-processes an order or double-refunds.
- Automated review rated the payment code the strongest part of the whole codebase (9/10). **But every test used a fake Mercado Pago — nothing was tried against the real sandbox. That's your job in Phase 4.**

- [x] I've read the summary above and understand what I'm confirming.

---

## Phase 2 — Setup (5 minutes)

- [x] **Do:** Make sure the local database is running. In a terminal, from the project folder, run:
  ```bash
  npx supabase status
  ```
  **✓ Passed if:** you see a list of running services with URLs (API, Studio, etc.). If it says it's not running, run `npx supabase start` first.

- [x] **Do:** Reset to clean sample data so your tests start fresh:
  ```bash
  npm run db:reset && npm run db:seed
  ```
  **✓ Passed if:** it finishes without errors and prints seed summary lines.

- [x] **Do:** Start the store (leave this running in its own terminal):
  ```bash
  npm run dev
  ```
  **✓ Passed if:** it prints `Local: http://localhost:3000` and the page opens in your browser showing chairs.

- [x] **Do:** Open **http://127.0.0.1:54323** (Supabase Studio) in another tab, click **Table Editor**.
  **✓ Passed if:** you can see tables including `orders`, `products`, and `discount_codes`.

---

## Phase 3 — Shop the store like a real customer (10 minutes)

Do a normal, honest purchase first so you know the happy path works.

- [x] **Do:** Go to http://localhost:3000, open a product (e.g. **Silla de Oficina Nova**, MX$2,499), pick a color, click **"Agregar al carrito."**
  **✓ Passed if:** a cart badge/count appears and the chair is in your cart.

- [x] **Do:** Open the cart (**carrito**), review it, and proceed to checkout (**"Proceder al pago"**).
  **✓ Passed if:** you land on the "Finalizar compra" page with an order summary on the side.

- [x] **Do:** Fill in contact info + a Mexican shipping address, then click **"Realizar pedido."**
  **✓ Passed if:** the button shows "Procesando…" then you're taken to a **"Pedido confirmado"** confirmation page with an order number like **PP-000001**.

- [x] **Do:** In Studio → Table Editor → **orders**, find your new row (newest `created_at`).
  **✓ Passed if:** the `total_cents` equals the price you saw (e.g. `249900` for one Nova = MX$2,499), the shipping address matches what you typed, and `status` = `pending_payment`.

---

## Phase 4 spot-checks — Try to cheat your own store (15 minutes)

These replace "reading the security code." Each is a real thing you do; the app should stop you.

- [x] **Do (buy more than exists):** Find **Silla Ergonómica Junior** and choose its **Blanco** (white) variant — that one is deliberately stocked at 0. Try to add it and check out. Also try setting a huge quantity (like 999) on any product and checking out.
  **✓ Passed if:** you get an out-of-stock / "un artículo se agotó" style message and **no** order is created (check `orders` in Studio — no new row).

- [x] **Do (reuse / abuse a discount):** At checkout, type the discount code **`AHORRA10`** (10% off) — it should apply. Then try these in separate attempts: **`EXPIRADO`** (expired), **`MINIMO5000`** (only valid on carts over MX$5,000), and a made-up code like **`NOEXISTE`**.
  **✓ Passed if:** `AHORRA10` reduces the total by 10%; the expired/too-small/fake codes are politely rejected and checkout still lets you buy at full price (a bad code never blocks the sale).

- [x] **Do (check the discount is real, not just visual):** Place an order with `AHORRA10` applied. In Studio → **orders**, look at your new row.
  **✓ Passed if:** `discount_cents` is exactly 10% of the subtotal and `total_cents` = subtotal + shipping − discount. The math adds up to the cent.

- [x] **Do (peek at someone else's order):** After a confirmation page loads, look at its web address — it ends in a long random code (the confirmation token). Change a few characters of that code in the address bar and press Enter.
  **✓ Passed if:** you get a "not found" page, not someone else's order. (Order numbers like PP-000001 are guessable; the confirmation link is not — this proves people can't snoop on other orders by guessing.)

- [x] **Do (double-click / double-submit):** On the checkout page, click **"Realizar pedido"** and immediately try to click it again, or refresh-and-resubmit fast.
  **✓ Passed if:** only **one** order appears in the `orders` table, not two. Stock in the `products` table dropped by the right amount only once.

---

## Phase 5 — Live Mercado Pago sandbox test (30 minutes) — THE IMPORTANT ONE

**This is the one thing the automated testing could not do, because it needs your real sandbox credentials.** Everything else was tested with a fake Mercado Pago; this proves it works against the real thing.

**Get test credentials:**
- [ ] **Do:** Log in at **https://www.mercadopago.com.mx/developers** → your application → **Credentials** → the **Test / Sandbox** (pruebas) section. Copy the **Access Token** and the **Webhook secret** (from the Webhooks/Notifications config). You'll also want a **Public Key**.
  **✓ Passed if:** you have a test access token, a test public key, and a webhook signing secret in hand.

**Put them in the app:**
- [ ] **Do:** Open the file `.env.local` in the project folder and fill in these three (they already exist as empty placeholders — just add the values after the `=`):
  ```
  MERCADOPAGO_ACCESS_TOKEN=   (your test access token)
  MERCADOPAGO_PUBLIC_KEY=     (your test public key)
  MERCADOPAGO_WEBHOOK_SECRET= (your webhook secret)
  ```
  Optionally set `NEXT_PUBLIC_SITE_URL` to the address Mercado Pago can reach your machine at (e.g. an ngrok tunnel URL) so its "payment happened" messages can arrive.
  **✓ Passed if:** the three values are filled and the file is saved. (This file is private and never committed to git.)

- [ ] **Do:** Stop the dev server (Ctrl-C in its terminal) and run `npm run dev` again so it picks up the new keys.
  **✓ Passed if:** it starts cleanly with no "missing MERCADOPAGO_..." errors.

Now run the four payment flows. Place an order, then on the confirmation page click **"Pagar ahora"** to go to Mercado Pago.

- [ ] **Flow 1 — Successful card.** Use Mercado Pago's well-known test card **Mastercard 5031 7557 3453 0604**, any future expiry (e.g. 11/30), CVV **123**, and cardholder name **APRO** (APRO = approve).
  **✓ Passed if:** you're sent back to the store as paid, and in Studio → **orders** your order's `payment_status` becomes `paid` and `status` becomes `paid`. In the **order_status_history** table there's a new row recording the change. In **mp_payment_events** there's a row for this payment.

- [ ] **Flow 2 — OXXO or SPEI (pending → paid).** Choose OXXO (or SPEI) at Mercado Pago instead of a card.
  **✓ Passed if:** you see a pending state with payment instructions (a voucher), and the order stays `pending_payment`. When you simulate/approve the payment in the sandbox, a follow-up message advances it to `paid` — check `orders.payment_status` flips to `paid` and a **second** row appears in `order_status_history`.

- [ ] **Flow 3 — Declined card.** Use the same test card but cardholder name **OTHE** (or Mercado Pago's documented "rejected" test name).
  **✓ Passed if:** the payment is declined, the order stays `pending_payment` (never accidentally marked paid), and you can go back and retry payment on the same order successfully.

- [ ] **Flow 4 — Refund.** Heads-up: the **admin screen for issuing refunds is part of a later task (T12) and isn't built yet.** The refund engine exists and was tested with a fake Mercado Pago, but there's no button for it today. **Recommended: defer live refund testing until T12 ships the admin refund button.** If you want to verify now anyway, a developer can trigger the refund function directly and you'd then check the **payment_refunds** table for a new row and `orders.payment_status` = `refunded` (for a full refund).
  **✓ Passed if:** you've either deferred this to T12 (fine), or a developer-triggered refund produced a `payment_refunds` row and the order shows refunded.

- [ ] **Do (bonus — fake message rejected):** From the Mercado Pago dashboard, re-send the same payment notification you already processed.
  **✓ Passed if:** nothing changes — the order stays as it was, no duplicate rows in `order_status_history` or `mp_payment_events`. (This proves replays and duplicates can't double-charge or double-advance an order.)

---

## Phase 6 — Email test (optional, 10 minutes)

Confirmation and payment emails are a later task (T9) but you can preview them now. **Live sending needs a Resend key you'd add later; until then, use preview mode — no key required.**

- [ ] **Do:** Stop the dev server, restart it in preview mode:
  ```bash
  EMAIL_DEV_PREVIEW=1 npm run dev
  ```
  Then place an order (Phase 3) and watch the terminal.
  **✓ Passed if:** the terminal prints `[email] PREVIEW (no network) ...` lines showing the recipient and subject for the order confirmation + the owner alert — proving the emails are wired up and would send once a real key (`EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_OWNER_ADDRESS`) is added.

---

## Phase 7 — Sign-off

- [x] I completed Phases 2–4 (checkout + cheat spot-checks) and everything passed. *(owner, 2026-07-23)*
- [ ] I completed Phase 5 (live Mercado Pago sandbox) — or I've consciously scheduled it before going live.
- [ ] (Optional) I previewed the emails in Phase 6.

**When all the boxes you care about are ticked:** tell the team "T7 and T8 are approved by the owner." They'll mark both tasks complete and clear the standing review gates.

**If anything felt wrong** (a total that didn't add up, an order that shouldn't have gone through, a payment that misbehaved): don't approve. Just jot down what you did and what you saw, hand it to the team, and they'll run a focused fix and bring it back to you. Your check is the final say for these two — nice work.
