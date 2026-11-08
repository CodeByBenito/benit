# BENIT — Business Rules & Edge-Case Policies

## 1. Monetary & Pricing Integrity

1. **Server-Side Authority:** Client-submitted prices, subtotals, or totals are **never** trusted. When an order is submitted (via `/menu/[slug]` or manual dashboard form), the server queries the current `products.price_cents` and `product_options.price_cents` inside a PostgreSQL transaction.
2. **Formula:**
   - `item_unit_total = product.price_cents + SUM(selected_option.price_cents)`
   - `total_item_cents = item_unit_total * quantity`
   - `subtotal_cents = SUM(total_item_cents)`
   - `total_cents = MAX(0, subtotal_cents - discount_cents + fee_cents)`
   - Note: Public digital menu orders cannot apply arbitrary discounts (`discount_cents = 0`). Only authenticated owners creating manual orders may specify a discount or fee.
3. **Price Snapshot Preservation:** Once an order is created, editing a product's price or deleting a product in the catalog **never** alters existing `orders`, `order_items`, or `order_item_options`.

---

## 2. Stock Reservation, Deduction & Reversal Policy

To balance operational accuracy with protection against unconfirmed spam orders:

1. **At Order Creation (`NEW`):**
   - **Pre-Check:** When a customer submits a digital order (or an owner creates a `NEW` order), the server verifies that `product.is_available = true` and, if `product.track_stock = true`, that `product.stock_quantity >= requested_quantity`. If insufficient stock exists, order creation is rejected immediately with a clear item-level error.
   - **No Premature Deduction on `NEW`:** A `NEW` order does not deduct stock yet (`orders.stock_deducted = false`).
   - *(Note: If an owner creates a Manual Order and chooses to mark it immediately as `CONFIRMED`, stock is deducted atomically during creation).*
2. **At Order Confirmation (`NEW` -> `CONFIRMED`):**
   - Inside a single database transaction (`transition_order_status_atomic`), the system locks the relevant `products` rows (`SELECT ... FOR UPDATE` ordered by `product_id` to prevent deadlocks).
   - For each item where `track_stock = true`:
     - Checks `stock_quantity >= item.quantity`. If any product lacks sufficient stock, the confirmation transaction rolls back and returns an explicit `INSUFFICIENT_STOCK` error specifying which product is short.
     - Deducts `stock_quantity = stock_quantity - item.quantity`.
     - Inserts a `stock_movements` record with `movement_type = 'ORDER_DEDUCTION'`, `quantity_delta = -item.quantity`, and `reference_key = 'order:' || order.id || ':item:' || item.id || ':deduct'`.
   - Sets `orders.stock_deducted = true`.
3. **At Order Cancellation (`*` -> `CANCELLED`):**
   - If the order was in `NEW` (`stock_deducted = false`), it transitions to `CANCELLED` without touching inventory.
   - If the order was in `CONFIRMED`, `PREPARING`, or `READY` (`stock_deducted = true`), the transaction locks the product rows, restores `stock_quantity = stock_quantity + item.quantity`, inserts a `stock_movements` record with `movement_type = 'ORDER_REVERSAL'` and `reference_key = 'order:' || order.id || ':item:' || item.id || ':reverse'`, and sets `orders.stock_deducted = false`.
   - `COMPLETED` orders cannot be cancelled directly without an explicit administrative flow.

---

## 3. Edge-Case Resolution Matrix

| Scenario | System Behavior |
| :--- | :--- |
| **Two customers order the final unit simultaneously** | Both may place a `NEW` order if submitted before confirmation, OR when the owner confirms Order A, the row-level lock (`FOR UPDATE`) deducts the final unit (`stock_quantity` becomes `0`). When the owner attempts to confirm Order B, the transaction fails atomically with `INSUFFICIENT_STOCK` for that product, preventing negative inventory. Furthermore, on the public menu, products with `track_stock = true AND stock_quantity = 0` are automatically shown as "Out of stock / Esgotado" and cannot be added to cart. |
| **An order is cancelled** | If `stock_deducted = false` (status was `NEW`), no stock movement occurs. If `stock_deducted = true`, a compensating `ORDER_REVERSAL` movement is atomically created and `stock_quantity` is incremented back. |
| **A confirmed order is edited** | In the MVP, confirmed orders have immutable item lists to guarantee ledger integrity. If a customer changes their items after confirmation, the owner cancels the existing order (which reverses the stock) and registers a new manual order. Order notes and status remain editable. |
| **A product becomes unavailable** | Toggling `is_available = false` (or `stock_quantity = 0`) immediately hides the "Add to Cart" action on `/menu/[slug]` and rejects any in-flight checkout attempt for that product on the server. Existing confirmed orders containing that product are unaffected. |
| **A real-time connection fails** | All mutations rely on HTTP Server Actions / PostgreSQL RPCs, never on WebSocket messages. If Supabase Realtime disconnects, the client displays a subtle connection status indicator, automatically reconnects, and executes a full state fetch upon reconnection or tab focus. |
| **The same request is submitted twice (Double-click / Retry)** | Order creation accepts a client-generated `idempotency_key` (`UNIQUE (store_id, idempotency_key)`). Duplicate submissions return the already-created order. Stock deductions use `orders.stock_deducted` + `SELECT ... FOR UPDATE` on the order row + `UNIQUE(reference_key)` on `stock_movements`, making double deduction impossible. |

---

## 4. Concurrency-Safe Order Number Generation

Order numbers are sequential per store (`#1`, `#2`, `#3`...).
Inside the `create_order_atomic` PostgreSQL function:
```sql
UPDATE stores
SET last_order_number = last_order_number + 1
WHERE id = p_store_id
RETURNING last_order_number INTO v_order_number;
```
Because PostgreSQL serializes `UPDATE` statements on the same `stores` row within the transaction and enforces `UNIQUE (store_id, order_number)`, two concurrent orders at the exact same millisecond are guaranteed to receive distinct, sequential order numbers.

