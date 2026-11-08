# BENIT — Development Roadmap

## Phase 0 — Discovery & Documentation (Current)
- [x] Inspect workspace and initialize Git repository linked to `https://github.com/CodeByBenito/benit.git`.
- [x] Author core architecture, schema, business rules, PRD, and security documentation in `docs/`.
- [ ] Review and approval of Phase 0 deliverables by stakeholder.

---

## Phase 1 — Foundation & Multi-Tenant Onboarding
- [ ] Scaffold Next.js (App Router, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons).
- [ ] Configure BENIT Dark Design System (`#101010`, `#1C1C1C`, `#242424`, `#FF6A00`, `#F3F3F0`, `#A1A1A1`, `#333333`, Manrope/Sora + Inter + `tabular-nums`).
- [ ] Create Supabase client/server utilities and Next.js auth middleware.
- [ ] Write initial SQL migrations (`0001_initial_schema.sql`, `0002_rls_policies.sql`, `0003_atomic_rpcs.sql`).
- [ ] Implement Auth pages (`/login`, `/register`, `/forgot-password`).
- [ ] Implement Multi-Tenant Onboarding flow (`/onboarding` to create Organization + Store).
- [ ] Build authenticated Dashboard Shell (Sidebar, Header, Store Status badge, User Profile menu).
- [ ] Verify tenant isolation between two distinct Owner accounts.

---

## Phase 2 — Digital Menu & Catalog Management
- [ ] Implement Categories management (Create, Edit, Reorder, Toggle Active, Delete).
- [ ] Implement Products management (Create, Edit, Archive/Delete, Image Upload to Supabase Storage, Availability toggle, Stock settings, Option Groups & Options).
- [ ] Build the Product Management table view (inspired by the "Cardápio" reference UI with filters, status badges, SKU, stock status, and quick actions).
- [ ] Build the Mobile-First Public Digital Menu (`/menu/[slug]`) with Category tabs, Product modal with Options, and persistent Shopping Cart drawer.

---

## Phase 3 — Order Management & Real-Time Operations
- [ ] Implement Public Checkout submission -> `create_public_order_atomic` RPC -> Order Confirmation screen.
- [ ] Build the Orders Stage Board ("Board por estágios" Kanban view: `NOVOS`, `CONFIRMADOS`, `EM PREPARO`, `PRONTOS` + `CONCLUÍDOS`/`CANCELADOS` filter tabs and Focus Mode toggle, matching the reference UI).
- [ ] Implement Manual Order Registration modal in the dashboard for counter/phone/table orders.
- [ ] Implement Order Details drawer with item snapshots, customer info, and `order_status_history` timeline.
- [ ] Wire Supabase Realtime subscriptions scoped by `store_id` for instant order arrival and status synchronization.

---

## Phase 4 — Product Inventory Control Center
- [ ] Build the Inventory Control Center UI (matching the "Estoque" reference UI: KPI summary cards, Low-stock watchlist cards, Selected item inspector panel with coverage bar, and searchable Inventory Registry table).
- [ ] Implement Manual Stock Entry, Exit, and Adjustment modals backed by `adjust_product_stock_atomic` RPC.
- [ ] Verify atomic stock deduction on `NEW` -> `CONFIRMED` and automatic stock reversal on `CANCELLED`.
- [ ] Build the Movement History audit log view.

---

## Phase 5 — Operational Dashboard, Customers & Polish
- [ ] Build the Revenue & Operational Overview Dashboard (matching the "Dashboard" reference UI: orange/dark comparative bar chart, KPI cards, live operational counters, low-stock alerts, and recent activity).
- [ ] Implement Customer Management module (`/customers`) with search, order count, total spent, order history drawer, and 1-click WhatsApp contact button.
- [ ] Implement Store Settings page (`/settings`) to edit store profile, slug, opening status, and public menu link sharing.
- [ ] Audit responsive layouts (Desktop, Tablet, Mobile), loading skeletons, error boundaries, and empty states.

---

## Phase 6 — Validation, Concurrency Testing & Pilot Readiness
- [ ] Execute end-to-end verification of all 18 mandatory testing requirements (Auth, RLS tenant isolation, Order lifecycle, Stock concurrency & idempotency, Realtime sync, Mobile responsiveness).
- [ ] Run production build (`npm run build`) and static type/lint verification.
- [ ] Prepare deployment checklist and pilot onboarding guide.

