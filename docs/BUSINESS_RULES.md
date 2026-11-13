# BENIT — Business Rules & Edge-Case Policies

## 1. Monetary, Option Group & Pricing Integrity

1. **Server-Side Authority:** Client-submitted prices, subtotals, or totals are **never** trusted. Inside `public.create_order_atomic`, PostgreSQL queries `products.price_cents` and `product_options.price_cents` directly from the store's catalog.
2. **Server-Side Option Group Rules Validation:**
   - Duplicate `option_id` values within the same order item are rejected (`DUPLICATE_OPTION`).
   - Every `product_option_groups` row belonging to the product is evaluated on the server:
     - Selected count must be `>= GREATEST(1, min_select)` when `is_required = true`, and `>= min_select` otherwise (`OPTION_MIN_REQUIRED`).
     - Selected count must be `<= max_select` (`OPTION_MAX_EXCEEDED`).
     - Every selected option must belong to the same `store_id` and `product_id` and have `is_available = true` (`INVALID_OPTION`).
3. **Formula:**
   - `item_unit_total = product.price_cents + SUM(selected_option.price_cents)`
   - `total_item_cents = item_unit_total * quantity`
   - `subtotal_cents = SUM(total_item_cents)`
   - `total_cents = MAX(0, subtotal_cents - discount_cents + fee_cents)`
   - Public digital menu orders enforce `discount_cents = 0`, `fee_cents = 0`, and `initial_status = 'NEW'`.
4. **Price Snapshot Preservation:** Editing a product's price or archiving/deleting a product never alters existing `orders`, `order_items`, or `order_item_options`.

---

## 2. Stock Reservation, Deduction & Reversal Policy

1. **At Order Creation (`NEW`):**
   - Aggregates requested quantities per `product_id` across all lines of the order, locks product rows in deterministic UUID order (`ORDER BY product_id FOR UPDATE`), and verifies `is_available = true` and `stock_quantity >= total_requested` (when `track_stock = true`).
   - `NEW` orders do not deduct stock prematurely (`stock_deducted = false`), preventing unconfirmed spam orders on the public menu from locking store inventory.
   - Manual orders created by an authenticated owner with `initial_status = 'CONFIRMED'` deduct stock atomically during creation.
2. **At Order Confirmation (`NEW` -> `CONFIRMED` / `PREPARING` / `READY` / `COMPLETED`):**
   - Locks the order row (`FOR UPDATE`) and locks all referenced product rows ordered by `product_id`.
   - Verifies sufficient stock for all items; if any item lacks stock, the entire transaction rolls back with `INSUFFICIENT_STOCK`.
   - Deducts `stock_quantity`, inserts `ORDER_DEDUCTION` rows in `stock_movements` with unique `reference_key = 'order:' || order_id || ':item:' || order_item_id || ':deduct'`, and sets `orders.stock_deducted = true`.
3. **At Order Cancellation (`*` -> `CANCELLED`):**
   - Only authenticated store operators can cancel orders in the MVP.
   - If `stock_deducted = false` (order was `NEW`), transitions to `CANCELLED` without modifying stock.
   - If `stock_deducted = true`, locks product rows, restores `stock_quantity`, records `ORDER_REVERSAL` movements with unique `reference_key = 'order:' || order_id || ':item:' || order_item_id || ':reverse'`, decrements customer `total_orders`/`total_spent_cents`, and sets `stock_deducted = false`.

---

## 3. Edge-Case Resolution Matrix

| Scenario | System Behavior |
| :--- | :--- |
| **Two customers order the final unit simultaneously** | Row-level lock (`FOR UPDATE`) during confirmation guarantees only the first confirmation deducts the final unit (`1 -> 0`). The second confirmation fails atomically with `INSUFFICIENT_STOCK`. Once `stock_quantity = 0`, `get_public_menu_by_slug` returns `in_stock = false`. |
| **An order is cancelled** | Reverses stock atomically if `stock_deducted = true`, or cancels cleanly with zero stock impact if `stock_deducted = false`. |
| **A confirmed order is edited** | Confirmed orders have immutable item snapshots; item changes are handled by cancelling the order (reversing stock) and registering a new manual order. |
| **A product becomes unavailable** | `get_public_menu_by_slug` reflects `is_available = false` immediately, and `create_order_atomic` rejects any in-flight checkout with `PRODUCT_UNAVAILABLE`. |
| **A real-time connection fails** | `useStoreRealtime` listens to WebSocket status, `online`, and `visibilitychange`, automatically triggering `router.refresh()` to reconcile state from PostgreSQL. |
| **Duplicate request submission** | `UNIQUE (store_id, idempotency_key)` on `orders` returns the existing order receipt on replay; `stock_deducted` + `UNIQUE (reference_key)` on `stock_movements` prevents double stock deductions. |


## 4. Checkout, Delivery, Coupons & Online Payments (migrations 0004–0007)

- **Server is the only price authority.** For digital orders, `create_order_atomic` ignores any client fee/discount and computes: item subtotal → coupon discount → zone fee. Minimum order = max(store minimum, zone minimum), checked against the subtotal before discount.
- **Business hours.** A store accepts digital orders when `is_open` (manual switch) is on **and** the current time (store timezone) falls in a `store_business_hours` slot. A slot with `closes_at <= opens_at` crosses midnight. A store with no slots is considered always open while `is_open`.
- **Delivery zones.** Neighborhood-only. Matching is accent- and case-insensitive (`São João` = `sao joao`). If a store has active zones, delivery to an unlisted neighborhood is rejected. With no zones, delivery has no fee.
- **Coupons.** PERCENT (1–100, optional cap) or FIXED (cents). Validity window, minimum order, global usage limit and per-customer limit (by phone) are enforced under a row lock, so concurrent checkouts cannot exceed limits. Cancelling or expiring an order releases its redemption.
- **Payment methods.** Online (`ONLINE_PIX`, `ONLINE_CARD`) needs a connected Mercado Pago account and `online_payment_enabled`. Offline methods must be in `stores.offline_methods`.
- **Online order lifecycle.**
  - The order is created as `AWAITING_PAYMENT` with `payment_status = PENDING`. It does not count in customer stats and does not touch stock.
  - Staff can only cancel an order in this state.
  - Approval (via webhook) reserves stock immediately and moves the order to `NEW` / `APPROVED`. If stock is short, the order is cancelled, the payment goes to `REFUND_PENDING` and the app refunds it automatically.
  - If the approved amount differs from the order total, the order never advances and a refund is requested.
  - Payment after expiry or cancellation → refund.
  - Unpaid orders past `payment_expires_at` are cancelled by `expire_unpaid_orders()` (pg_cron every minute; `/api/cron/expire` as fallback).
- **Offline orders** keep the original rule: stock is deducted on confirmation and returned on cancellation.
- **Cancelling a paid order** returns stock, releases the coupon, reverses customer stats and triggers an automatic refund on Mercado Pago.
- **Idempotency.** The checkout sends one idempotency key per bag session, so double taps and retries return the same order. Webhook events are deduplicated, and the payment state never regresses.


## 5. Team & Roles (migration 0009)

- **Roles.** `OWNER` (organization-wide, full access), `MANAGER` (everything except managing people), `ATTENDANT` (orders and customers), `KITCHEN` (orders only, on the kitchen board).
- **Scope.** A membership is either organization-wide (`store_id IS NULL`) or tied to one store. A person never has both in the same organization; they may have one membership per store.
- **Who manages the team.** Only the organization `OWNER` invites, changes roles and removes. Managers see the list, read-only. Attendants and kitchen staff do not see it.
- **Inviting.** The owner types an e-mail, a role and a store (or "all stores").
  - New e-mail: an invitation is sent; the link lets the person create a password and lands them in the panel. Until they sign in, the member shows as "Convite pendente" and the owner can re-send.
  - E-mail that already has a BENIT account: access is immediate and the person is told by e-mail.
  - An account that already belongs to another organization is refused. The panel shows one organization per account; multi-organization access is not supported.
- **`OWNER` is not handed out from the panel.** It cannot be chosen in an invitation or a role change, and the role of an owner cannot be changed.
- **Last owner.** An organization always keeps at least one owner: the last one cannot be removed, by themself or by anyone.
- **Removal** cuts access at once. Orders and records made by that person stay in the history.
- **What the kitchen sees.** Confirmed, preparing and ready orders, with items, add-ons and notes, the first name of the customer and the table. No prices, phone, address or payment data: the server does not send them to a kitchen session. The kitchen moves an order from "A fazer" to "Em preparo" to "Pronto"; confirming a new order and handing it over stay with the front of house.
- **Pausing the store.** Everyone except kitchen staff can pause or reopen the store from the panel.

> Roles in the interface are presentation. Data is protected by the database (RLS, guard triggers, RPC checks), which is stricter where it matters: settings, payments and publication require `OWNER`/`MANAGER`; team changes require the owner.

## 6. Menu Ordering, Images & Add-ons (migration 0010)

- **Order.** Categories, and products inside each category, appear to the customer in the order the store arranges them by dragging. A new product, or one moved to another category, goes to the end of that category. Saving a product never changes its position.
- **Deleting a category** does not delete its products: they move to "Sem categoria", shown at the end of the public menu.
- **Add-on groups** are edited with the product. A group needs a name and at least one option; `max` cannot exceed the number of options and `min` cannot exceed `max`. A required group needs at least one choice.
- **Editing keeps identities.** Groups and options that still exist keep their ids when a product is saved, so a customer who already has the menu open does not lose the bag.
- **Removing a product** archives it: it leaves the menu and the stock screen, and old orders keep their item.
- **Images.**
  - Logo: square, cropped by the store, stored at 512×512.
  - Cover: cropped to the menu header proportion, stored at 1600×600.
  - Product photo: resized to at most 1200 px on the longest side.
  - Logo and cover accept JPG, PNG or WebP up to 2 MB; product photos up to 12 MB before resizing. Everything is converted in the browser (WebP when the browser can encode it) before upload, and the storage bucket itself refuses anything that is not an image or is larger than 5 MB.
  - Replacing a logo or cover deletes the previous file.

## 7. Stock Screen Rules

- **Levels.** Sold out (0), below minimum (at or under the alert quantity of the product) and healthy. "Abaixo do mínimo" includes sold-out products.
- **Quick adjustments.** Entry adds, exit subtracts and can never go below zero, count sets the absolute quantity. Each one records a movement with an optional reason.
- **Untracked products** start being tracked with a first count.
- Orders keep deducting and returning stock on their own (sections 2 and 4); the screen updates in real time.

## 8. Public Checkout Limits (migration 0011)

- **Per phone.** At most **5 orders per phone, per store, every 10 minutes** through the digital menu. The sixth is refused with "Você fez muitos pedidos em pouco tempo…". Cancelled orders count, so cancelling is not a way around. A retry of the same order (same idempotency key) is not a new order. Manual orders typed by staff are never limited.
- **Per visitor.** The app also limits, per visitor address and store, quotes (120), orders (12) and card attempts (30) every 10 minutes. This layer fails open: if the counter is unavailable the checkout keeps working.
- The values live in `public.public_order_limit()` (database) and `PUBLIC_LIMITS` in `src/lib/rate-limit.ts` (app).

## 9. Accounts & Passwords

- Passwords have at least 8 characters, on sign-up, on reset and for invited members.
- Every e-mail link (confirm account, reset password, team invitation) lands on `/auth/callback`, which signs the person in and sends them on: onboarding after sign-up, the new-password screen after a reset or an invitation.
- A reset link works once and expires; an expired link leads to a screen that offers a new one. The "forgot password" form never reveals whether an e-mail has an account.
