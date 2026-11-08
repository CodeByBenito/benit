# BENIT — Security & Multi-Tenant Isolation Strategy

## 1. Defense-in-Depth Architecture

BENIT enforces security across four distinct layers:
1. **Edge / Middleware Layer (`src/middleware.ts`):** Next.js Middleware refreshes Supabase Auth sessions and blocks unauthenticated access to `/dashboard`, `/orders`, `/menu-manager`, `/inventory`, `/customers`, `/settings`, and `/onboarding`.
2. **Application / Server Action Layer:** Every Server Action validates payloads via **Zod**, authenticates the caller via `supabase.auth.getUser()`, and resolves `organization_id` and `store_id` from verified `memberships` records (`getTenantContext`).
3. **Database Layer (PostgreSQL RLS + Composite Tenant Foreign Keys):**
   - Every table has Row Level Security (RLS) enabled.
   - Composite foreign keys (`FOREIGN KEY (child_ref_id, store_id) REFERENCES parent(id, store_id)`) make cross-tenant relational linking mathematically impossible at the PostgreSQL constraint level.
4. **Controlled RPC & Function Privilege Layer:**
   - Administrative `SECURITY DEFINER` functions explicitly execute `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon` and grant execution strictly to `authenticated`.
   - Public operations (`get_public_menu_by_slug` and `create_order_atomic` with `source = 'DIGITAL_MENU'`) expose zero direct table access to `anon`.

---

## 2. Row Level Security (RLS) Helper Functions

- `public.is_org_member(p_org_id UUID) RETURNS BOOLEAN`:
  Checks whether `auth.uid()` holds a membership in `p_org_id`.
- `public.is_org_owner(p_org_id UUID) RETURNS BOOLEAN`:
  Checks whether `auth.uid()` holds an organization-wide `OWNER` role (`role = 'OWNER' AND store_id IS NULL`) in `p_org_id`.
- `public.has_store_access(p_store_id UUID) RETURNS BOOLEAN`:
  Checks whether `auth.uid()` belongs to the store's organization with either organization-wide access (`m.store_id IS NULL`) or branch-specific access (`m.store_id = p_store_id`).
- `public.can_manage_store_asset(p_object_name TEXT) RETURNS BOOLEAN`:
  Validates that the first folder segment of a Supabase Storage path (`<store_id>/products/...`) is a valid UUID and that `public.has_store_access(store_uuid)` is `true`.

---

## 3. Table-by-Table RLS Matrix

| Table | Authenticated Tenant Access (`authenticated`) | Public / Anonymous Access (`anon`) |
| :--- | :--- | :--- |
| `profiles` | `SELECT` / `UPDATE` own row (`id = auth.uid()`); `is_platform_admin` is immutable by user. | **None.** |
| `organizations` | `is_org_member(id)` for `SELECT`; `is_org_owner(id)` for `UPDATE`. | **None.** |
| `memberships` | `is_org_member(organization_id)` for `SELECT`; `is_org_owner(organization_id)` for `INSERT`. | **None.** |
| `stores` | `has_store_access(id)` for all operations. | **None on base table.** Public reads go strictly through `get_public_menu_by_slug(p_slug)`. |
| `categories` | `has_store_access(store_id)` for all operations. | **None on base table.** Served via `get_public_menu_by_slug`. |
| `products` | `has_store_access(store_id)` for all operations. | **None on base table.** Served via `get_public_menu_by_slug` (hiding `stock_quantity`, `low_stock_threshold`, and `sku`). |
| `product_option_groups` & `product_options` | `has_store_access(store_id)` for all operations. | **None on base table.** Served via `get_public_menu_by_slug`. |
| `customers` | `has_store_access(store_id)` for all operations. | **None.** |
| `orders`, `order_items`, `order_item_options`, `order_status_history` | `has_store_access(store_id)` for all operations. | **None on base tables.** Public orders are submitted via `create_order_atomic` (`source = 'DIGITAL_MENU'`), returning only the order receipt. |
| `stock_movements` | `has_store_access(store_id)` for `SELECT`; writes occur exclusively via atomic stock/order RPCs. | **None.** |
| `storage.objects` (`benit-assets`) | `INSERT`, `UPDATE`, `DELETE` require `can_manage_store_asset(name)` (`<store_id>/...`). | Public `SELECT` on `benit-assets` image URLs. |

---

## 4. Supabase Realtime Security & Reconnection Strategy

- `orders` and `products` are configured with `REPLICA IDENTITY FULL` and added to `supabase_realtime` alongside `stock_movements`.
- Because `anon` has **zero** `SELECT` privileges on `orders`, `products`, and `stock_movements`, Supabase Realtime evaluates `has_store_access(store_id)` against the authenticated user's JWT before broadcasting any WAL event.
- On the client (`useStoreRealtime`), channels subscribe with `filter: store_id=eq.<storeId>` and automatically reconcile any missed events upon WebSocket `SUBSCRIBED`, `online`, or `visibilitychange`.

---

## 5. Secrets & Environment Hygiene

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are safe in the browser because `anon` cannot read any base table directly.
- `SUPABASE_SERVICE_ROLE_KEY` is never exposed to client code and `.env*` files are excluded via `.gitignore`.
