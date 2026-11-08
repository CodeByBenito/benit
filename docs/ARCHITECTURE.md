# BENIT — System Architecture

## 1. Architectural Style: Modular Monolith

BENIT is built as a **Modular Monolith** on **Next.js (App Router + TypeScript)** and **Supabase (PostgreSQL, Auth, Realtime, Storage)**.

- **Database-Enforced Multi-Tenancy:** Tenant boundaries are enforced by PostgreSQL Row Level Security (`has_store_access`), composite tenant foreign keys (`(id, store_id)`), and `SECURITY DEFINER` transactional RPCs.
- **Zero Public Table Exposure:** Anonymous visitors on `/menu/[slug]` never read base tables directly; they consume a sanitized projection RPC (`get_public_menu_by_slug`) and submit orders via `create_order_atomic`.
- **Future Multi-Unit & Subscription Ready:** `organizations` carries plan metadata (`plan_tier`, `subscription_status`, `max_stores`), and `memberships` supports both organization-wide (`store_id IS NULL`) and store-specific (`store_id = <uuid>`) access roles.

---

## 2. High-Level Component & Security Flow

```mermaid
flowchart TD
    subgraph Clients["Client Layer"]
        PublicClient["Public Customer Browser\n(/menu/[slug] - Mobile First)"]
        OwnerClient["Authenticated Store Operator\n(Dashboard, Kanban, Inventory, CRM)"]
    end

    subgraph NextApp["Next.js App Router Layer"]
        PublicSSR["Public Menu Server Page\nCalls RPC get_public_menu_by_slug"]
        ProtectedSSR["Authenticated Server Pages & Actions\nZod Validation + Tenant Context"]
    end

    subgraph SupabasePlatform["Supabase Platform"]
        SupaAuth["Supabase Auth (JWT)"]
        Postgres["PostgreSQL\nStrict RLS + Composite FKs + Atomic RPCs"]
        Realtime["Supabase Realtime\nJWT RLS + store_id Filter"]
        Storage["Supabase Storage (benit-assets)\nFolder Guard: can_manage_store_asset"]
    end

    PublicClient -->|View Menu / Checkout| PublicSSR
    PublicSSR -->|Sanitized JSON Projection / Order RPC| Postgres
    OwnerClient -->|Operational Actions| ProtectedSSR
    ProtectedSSR -->|Authenticated Queries & RPCs| Postgres
    OwnerClient <-->|useStoreRealtime (orders, products, stock_movements)| Realtime
    Postgres -->|REPLICA IDENTITY FULL WAL| Realtime
    OwnerClient -->|Upload <store_id>/products/*| Storage
    OwnerClient <-->|Session Cookie / JWT| SupaAuth
```

---

## 3. Realtime Synchronization Architecture

1. **Database Publication:** `orders` (`REPLICA IDENTITY FULL`), `products` (`REPLICA IDENTITY FULL`), and `stock_movements` are published to `supabase_realtime`.
2. **Broker Authorization:** Because base tables disallow `anon` reads and require `public.has_store_access(store_id)` for `authenticated`, Supabase Realtime verifies the operator's JWT before delivering change events.
3. **Client Hook (`src/lib/supabase/use-store-realtime.ts`):**
   - Used in both the **Orders Kanban Board** (`orders`, `products`) and the **Inventory Control Center** (`products`, `stock_movements`).
   - Reconciles state via `router.refresh()` on every relevant change event as well as on WebSocket reconnection, browser `online`, and tab `visibilitychange`.
