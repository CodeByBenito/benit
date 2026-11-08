# BENIT — System Architecture

## 1. Architectural Style: Modular Monolith

BENIT is architected as a **Modular Monolith** built on **Next.js (App Router)** and **Supabase (PostgreSQL, Auth, Realtime, Storage)**.

Why this architecture fits BENIT:
- **Zero Distributed Systems Overhead:** Eliminates microservice network latency, dual-write bugs, and complex deployment orchestration during the MVP and early growth stages.
- **Database-Enforced Multi-Tenancy:** By pairing Supabase Auth JWTs with PostgreSQL Row Level Security (RLS) and transactional PL/pgSQL RPC functions, tenant isolation and stock/order consistency are guaranteed at the data layer.
- **Strict Feature Boundaries:** Business logic is organized by domain feature (`features/orders`, `features/inventory`, `features/products`, etc.), keeping React presentation components thin and declarative.

---

## 2. High-Level Component Diagram

```mermaid
flowchart TD
    subgraph Clients["Client Layer"]
        PublicClient["Public Customer Browser\n(/menu/[slug] - Mobile First)"]
        OwnerClient["Authenticated Owner Browser\n(Dashboard, Kanban, Inventory)"]
    end

    subgraph NextApp["Next.js Application Layer (Vercel)"]
        AppRouter["Next.js App Router\n(Server & Client Components)"]
        ServerActions["Server Actions & Route Handlers\n(Zod Validation + Auth Context)"]
        DomainModules["Feature Domain Modules\n(orders, inventory, menu, customers)"]
    end

    subgraph SupabasePlatform["Supabase Backend Platform"]
        SupaAuth["Supabase Auth\n(JWT Session & Identity)"]
        Postgres["PostgreSQL Database\n(RLS Policies + Transactional RPCs)"]
        Realtime["Supabase Realtime\n(Scoped Postgres Changes)"]
        Storage["Supabase Storage\n(Product & Store Images)"]
    end

    PublicClient -->|Browse Menu / Submit Order| AppRouter
    OwnerClient -->|Manage Store & Orders| AppRouter
    AppRouter --> ServerActions
    ServerActions --> DomainModules
    DomainModules -->|Authenticated / Public Queries & RPCs| Postgres
    OwnerClient <-->|WebSocket Subscription (store_id)| Realtime
    Postgres -->|WAL Events| Realtime
    OwnerClient -->|Signed / Authenticated Upload| Storage
    OwnerClient <-->|Session Cookie / JWT| SupaAuth
```

---

## 3. Directory Structure

```text
src/
  app/
    (auth)/
      login/
      register/
      forgot-password/
    (onboarding)/
      onboarding/
    (dashboard)/
      dashboard/
      orders/
      menu/
      inventory/
      customers/
      settings/
    menu/
      [slug]/
    api/
  components/
    ui/               # shadcn/ui primitives styled for BENIT dark theme
    layout/           # Sidebar, Topbar, StoreSwitcher, PageHeader
    dashboard/        # Revenue charts, KPI cards, Low-stock watchlist
    orders/           # Kanban stage board, Order table, Manual order modal, Details drawer
    menu/             # Category manager, Product table/modal, Public menu & Cart drawer
    inventory/        # Inventory control center, Stock adjustment modal, Movement ledger
    customers/        # Customer list, Customer detail drawer, WhatsApp action
  features/
    auth/             # Auth actions, session helpers
    organizations/    # Organization & membership queries/mutations
    stores/           # Store configuration, open/close toggle, slug validation
    categories/       # Category CRUD & ordering
    products/         # Product & option groups CRUD
    orders/           # Digital & manual order creation, status transitions
    inventory/        # Stock adjustments, movement queries
    customers/        # Customer lookup, creation, history aggregation
  lib/
    supabase/         # client.ts (browser), server.ts (SSR/Actions), middleware.ts
    validations/      # Shared Zod schemas (orders, products, inventory, auth)
    permissions/      # Tenant & store access guards
    utils/            # Currency formatting (minor units), phone/WhatsApp helpers, cn()
  types/
    database.types.ts # Generated/strongly-typed Supabase schema types
    domain.types.ts   # Application domain interfaces
supabase/
  migrations/         # Sequential SQL migrations (schema, RLS, RPCs, triggers)
  seed.sql            # Optional development seed data (never used in production screens)
docs/                 # Product & technical documentation
```

---

## 4. Data Flow & State Synchronization

1. **Reads (Server Components):**
   - Authenticated dashboard pages fetch initial state on the server using the user's Supabase session cookie (`createServerClient`). RLS automatically restricts rows to the user's authorized `organization_id` and `store_id`.
2. **Writes (Server Actions & Transactional RPCs):**
   - All mutations pass through Next.js Server Actions, validate payloads via **Zod**, verify tenant ownership, and execute either standard RLS-protected statements or atomic PostgreSQL RPC functions (e.g., `create_order_atomic`, `transition_order_status_atomic`, `adjust_product_stock_atomic`).
3. **Real-Time Updates (Supabase Realtime):**
   - The client subscribes to a store-scoped channel (`orders:store_id=eq.<UUID>` and `products:store_id=eq.<UUID>`).
   - When a new order arrives or status/stock changes, the UI updates optimistically/reactively and triggers `router.refresh()` or targeted query revalidation to guarantee 100% consistency with PostgreSQL.
   - On WebSocket reconnection or visibility change (`visibilitychange`), the client automatically re-fetches the latest state from the database.

