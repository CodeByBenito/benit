# BENIT — Security & Multi-Tenant Isolation Strategy

## 1. Defense-in-Depth Architecture

BENIT enforces security across three distinct layers:
1. **Edge / Middleware Layer:** Next.js Middleware refreshes Supabase Auth sessions and guards `/dashboard/*` and `/onboarding/*` routes from unauthenticated visitors.
2. **Application / Server Action Layer:** Every Server Action validates input schemas via **Zod**, authenticates the caller via `supabase.auth.getUser()`, and derives `organization_id` / `store_id` from verified membership records rather than trusting client-supplied IDs where applicable.
3. **Database Layer (PostgreSQL RLS & `SECURITY DEFINER` RPCs):** Every table has Row Level Security (RLS) enabled. Even if a bug existed in frontend code, PostgreSQL refuses unauthorized reads or writes.

---

## 2. Row Level Security (RLS) Helper Functions

To keep RLS policies fast and maintainable, the database defines indexed helper functions:

- `public.is_org_member(p_org_id UUID) RETURNS BOOLEAN`:
  Checks if `auth.uid()` has an active row in `public.memberships` for `p_org_id`.
- `public.has_store_access(p_store_id UUID) RETURNS BOOLEAN`:
  Checks if `auth.uid()` is a member of the organization that owns `p_store_id`.

---

## 3. Table-by-Table RLS Policies

| Table | Authenticated Tenant Access (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) | Public / Anonymous Access (`anon`) |
| :--- | :--- | :--- |
| `profiles` | Users can `SELECT` and `UPDATE` only their own profile (`id = auth.uid()`). | None. |
| `organizations` | Members can `SELECT`; `OWNER` can `UPDATE`. Authenticated users can `INSERT` during onboarding. | None. |
| `memberships` | Members of the same organization can `SELECT`. Only `OWNER` can manage memberships. | None. |
| `stores` | `has_store_access(id)` for all operations. | `SELECT` allowed **only** on public columns/views where `is_published = true`. |
| `categories` | `has_store_access(store_id)` for all operations. | `SELECT` allowed where `is_active = true` and parent store `is_published = true`. |
| `products` | `has_store_access(store_id)` for all operations. | `SELECT` allowed where `is_archived = false` and parent store `is_published = true`. |
| `product_option_groups` & `product_options` | `has_store_access(store_id)` for all operations. | `SELECT` allowed where parent store `is_published = true`. |
| `customers` | `has_store_access(store_id)` for all operations. | **None.** Public visitors cannot read customer records. |
| `orders`, `order_items`, `order_item_options`, `order_status_history` | `has_store_access(store_id)` for all operations. | **No direct table access.** Public orders are created exclusively through a controlled server-side RPC (`create_public_order_atomic`) that returns only the newly created order summary receipt. |
| `stock_movements` | `has_store_access(store_id)` for `SELECT`; mutations occur exclusively via atomic stock RPCs verifying `has_store_access(store_id)`. | **None.** |

---

## 4. Public Digital Menu Data Protection

- Public endpoints (`/menu/[slug]`) expose **only**:
  - Store public profile (`name`, `slug`, `description`, `logo_url`, `banner_url`, `is_open`, `whatsapp`, `address`, `currency`).
  - Active categories (`id`, `name`, `description`, `sort_order`).
  - Non-archived products (`id`, `category_id`, `name`, `description`, `price_cents`, `image_url`, `is_available`, and a boolean `in_stock` flag computed as `NOT track_stock OR stock_quantity > 0`).
  - Exact internal `stock_quantity`, `low_stock_threshold`, `sku`, and financial metrics are **stripped** from public responses.

---

## 5. Secrets & Environment Hygiene

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe for client/server usage because RLS is strictly enforced.
- `SUPABASE_SERVICE_ROLE_KEY` is **never** exposed to the client (`NEXT_PUBLIC_` prefix is prohibited for it) and is never committed to Git (`.env*` is ignored in `.gitignore`).

