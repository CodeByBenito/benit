# BENIT — Security & Multi-Tenant Isolation Strategy

## 1. Defense-in-Depth Architecture

BENIT enforces security across four distinct layers:
1. **Edge / Middleware Layer (`src/middleware.ts`):** Next.js Middleware refreshes Supabase Auth sessions and blocks unauthenticated access to `/dashboard`, `/orders`, `/menu-manager`, `/inventory`, `/customers`, `/settings`, and `/onboarding`. `/auth/*` and `/reset-password` are always reachable (section 7).
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


## 6. Payments & Public Surfaces (migrations 0005–0007)

- **Secrets table.** `store_payment_accounts`, `oauth_states` and `webhook_events` have RLS enabled with zero policies plus `REVOKE ALL` from `anon`/`authenticated`: only the service role can touch them. Mercado Pago tokens are additionally encrypted in the app (AES-256-GCM, `TOKEN_ENC_KEY`).
- **Guard triggers.** Direct PostgREST writes (`current_user = 'authenticated'`) cannot change an order's status, totals, payment fields, stock flags or public token. Those change only inside SECURITY DEFINER RPCs. Store payment/publication settings can only be changed by OWNER/MANAGER (`can_manage_store`), and online payment cannot be enabled without an active connected account.
- **Role checks in the app.** Settings, zones, hours, coupons and Mercado Pago connect/disconnect actions call `requireStoreManager()` before writing.
- **Webhook.** Every request's `x-signature` is verified with HMAC-SHA256 (constant-time compare, timestamp tolerance). The payment is re-fetched from Mercado Pago with the store's token and its `external_reference` must belong to that store. Duplicate events are dropped by a unique key.
- **OAuth.** CSRF `state` with a 10-minute TTL, PKCE (S256). The callback re-checks the logged-in user and their role.
- **RPC privileges.** `apply_payment_update`, `record_payment_attempt`, `mark_refund_failed` and `expire_unpaid_orders` are granted to `service_role` only. The legacy 12-argument `create_order_atomic`, which trusted client fees, is dropped.
- **Public tracking.** `get_public_order_by_token` needs a 64-hex (256-bit) token and returns no name, phone or address. Realtime broadcast payloads carry only status fields.
- **Crons** require `Authorization: Bearer CRON_SECRET` (constant-time compare).


## 7. Auth Links, Roles & Team (migration 0009)

- **Open auth routes.** `/auth/callback` and `/reset-password` are reachable signed in or not; they are neither protected nor guest-only. The callback accepts a PKCE `code` or a `token_hash` and only redirects to same-origin paths (`safeNextPath`): `next=https://…`, `//host` and backslash tricks fall back to `/dashboard`.
- **Role gate per page.** Every panel page calls `requireArea()`. A role without access to an area is redirected to its own first screen; the sidebar only lists permitted areas. This is presentation: the database remains the authority.
- **Data minimisation for the kitchen.** For a `KITCHEN` session the orders page selects only the columns a cook needs. Phone, address, totals and payment fields are not queried at all.
- **`memberships` writes.** The table has no `UPDATE` or `DELETE` policy. Role changes and removals go only through `update_team_member_role` and `remove_team_member`, which check `is_org_owner`, refuse the `OWNER` role, lock the row and protect the last owner. Unknown ids and ids of other tenants get the same `FORBIDDEN` answer.
- **`profiles` stays private.** Names and e-mails of teammates are read only through `list_team_members` (owner, or a manager for the stores they manage).
- **Invitations.** `add_team_member` runs with the session of the inviting owner and enforces every rule. The service role is used for one thing: sending the Supabase invitation e-mail to an address with no account, and only after that RPC accepted the request. If linking fails afterwards, the freshly invited account is deleted.

| Table | Authenticated | Anonymous |
| :--- | :--- | :--- |
| `memberships` | `SELECT` for org members; `INSERT` for the org owner; `UPDATE`/`DELETE` only via the team RPCs. | **None.** |
| `rate_limit_buckets` | **None** (RLS on, no policies, privileges revoked). | **None.** |

## 8. Uploads & Storage (migration 0010)

- **Bucket limits.** `benit-assets` accepts only `image/webp`, `image/jpeg` and `image/png`, up to 5 MB, enforced by Storage itself.
- **Paths are validated on the server.** For logo and cover the browser sends a storage *path*, never a URL. `setStoreBrandImageAction` requires `<storeId>/<kind>-<timestamp>.<ext>` for exactly that store and kind and requires `OWNER`/`MANAGER`. A product photo that changes must be a file under `<storeId>/` in our bucket.
- **Server-side image fetches** (share images) are limited to public objects of our own bucket (`isOwnStorageUrl`), so a stored URL can never make the server request an arbitrary host.
- **`reorder_catalog`** is `SECURITY INVOKER`: the RLS of the caller decides what is updated; ids of other stores are ignored.

## 9. Public Checkout Abuse Limits (migration 0011)

- **Per phone, inside the transaction.** A `BEFORE INSERT` trigger on `orders` limits digital-menu orders per phone and store. It runs inside `create_order_atomic`, after the store row is locked, so it cannot be bypassed by calling the RPC directly with the anon key and concurrent requests are counted correctly.
- **Per visitor, in the app.** `consume_rate_limit` (service role only) is a fixed-window counter. The app keys it with a SHA-256 hash of the visitor address plus the target; raw addresses are never stored, and old buckets are purged.
- **Fails open** by design: a broken limiter must not take the checkout down. The per-phone trigger does not fail open.

## 10. Error Handling & Public Pages

- Error boundaries never render `error.message`; they show a generic text and the error digest for support.
- `/dev/*` is guarded once in `src/app/dev/layout.tsx` and answers 404 in production.
- `robots.txt` disallows the panel, `/pedido`, `/dev`, `/api`, `/auth` and `/reset-password`. The sitemap lists only the landing, the legal pages and published menus.
- The Mercado Pago webhook answers 200 for a store without a connected account (nothing to retry) and 401 for a missing or wrong signature.

## 11. Dependencies

- `next` is pinned to the latest 15.1 patch. Keep it on the newest patch of its line: the framework has had critical advisories (middleware bypass, RSC).
- Brand image routes (`icon`, `apple-icon`, `opengraph-image`) run on the Edge runtime with fonts bundled as assets.
