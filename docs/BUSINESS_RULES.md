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
