# BENIT — Product Requirements Document (PRD)

**Product Name:** BENIT  
**Tagline:** "Your operation. Under control." / "Sua operação. Sob controle."  
**Category:** Food Tech / Multi-Tenant SaaS / Restaurant Operational Management  

---

## 1. Executive Summary & Vision

BENIT is a modern, real-time operational management SaaS platform built for food businesses (restaurants, burger shops, pizzerias, snack bars, cafés, and dark kitchens). Rather than acting as a bloated legacy ERP, BENIT focuses on **speed, reliability, operational clarity, and usability** across four core pillars:

1. **Orders Management** (Digital Menu & Manual POS/Dashboard entry)
2. **Digital Menu** (Mobile-first public store catalog & checkout)
3. **Customer Service** (Scoped customer directory, order history, & one-click WhatsApp action)
4. **Product Inventory** (Product-level stock tracking, atomic reservations/deductions, and full movement ledger)

---

## 2. Target Audience & Multi-Tenant Business Model

- **Target Segment:** Small to medium-sized food establishments requiring unified control over digital and counter/phone orders alongside real-time product availability.
- **Multi-Tenancy:** Shared infrastructure with strict logical isolation enforced via PostgreSQL Row Level Security (RLS).
  - An **Organization** represents the legal/business entity owned by an account holder.
  - A **Store** represents an operational unit (establishment location/brand) belonging to an Organization.
  - All operational data (`categories`, `products`, `orders`, `customers`, `stock_movements`) is strictly scoped to a `store_id` (and by extension, `organization_id`).
- **Role Readiness:** MVP is **Owner-only** in UI workflow, while the database schema natively supports `memberships` with roles (`OWNER`, `MANAGER`, `ATTENDANT`, `KITCHEN`) and separate platform administration.

---

## 3. Core MVP Modules & Functional Scope

### 3.1. Authentication & Onboarding
- Email/password sign-up, login, logout, and password recovery via Supabase Auth.
- Protected dashboard routes and server-side session verification.
- Guided onboarding flow:
  1. Account creation -> 2. Organization & Store creation (name, slug, phone, description) -> 3. Initial setup checklist (create categories, products, publish digital menu).

### 3.2. Central Operational Dashboard
- Real-time operational metrics derived strictly from database records:
  - Total orders (filtered by period/today)
  - New orders awaiting confirmation (`NEW`)
  - Orders in progress (`CONFIRMED`, `PREPARING`, `READY`)
  - Completed orders (`COMPLETED`)
  - Revenue overview (tabular currency formatting, daily/weekly bar charts)
  - Low-stock watchlist & out-of-stock alerts
  - Recent operational activity feed
- Meaningful empty states when a store has no orders or products yet.

### 3.3. Orders Management (Kanban & List Views)
- Dual order sources: `DIGITAL_MENU` (public customer checkout) and `MANUAL` (dashboard creation by owner).
- Complete lifecycle state machine: `NEW` -> `CONFIRMED` -> `PREPARING` -> `READY` -> `COMPLETED`, plus `CANCELLED`.
- Immutable historical snapshots: product name, base unit price, and selected option names/prices are snapshotted onto `order_items` and `order_item_options` at order creation so future catalog edits never corrupt historical financials.
- Concurrency-safe sequential `order_number` per store.
- Real-time board synchronization via Supabase Realtime (`postgres_changes`).

### 3.4. Public Digital Menu (`/menu/[slug]`)
- Mobile-first public storefront accessible via unique store slug.
- Displays store header (logo/banner, description, open/closed status), category navigation, and available products with options/add-ons.
- Interactive cart with quantity controls, option validation, item notes, and customer identification (Name, Phone, fulfillment/notes).
- Zero leakage of private tenant metrics, internal stock counts, or other stores' data.
- Server-side price calculation and stock/availability validation upon submission.

### 3.5. Products & Categories Management
- Category CRUD with custom display ordering (`sort_order`) and active toggle.
- Product CRUD with image upload (Supabase Storage), price in minor units (`price_cents`), availability toggle (`is_available`), stock tracking toggle (`track_stock`), `stock_quantity`, and `low_stock_threshold`.
- Product Option Groups (e.g., "Size", "Extras") with min/max selection rules and option items with additional price (`price_cents`).

### 3.6. Product-Level Inventory Control
- Real-time inventory registry displaying current stock, low-stock threshold, and health status (`HEALTHY`, `LOW_STOCK`, `OUT_OF_STOCK`).
- Auditable `stock_movements` ledger recording every entry (`ENTRY`), manual exit (`EXIT`), manual adjustment (`ADJUSTMENT`), order deduction (`ORDER_DEDUCTION`), and cancellation reversal (`ORDER_REVERSAL`).
- Atomic stock deduction upon order confirmation (`CONFIRMED`) and automatic compensating reversal if a confirmed/preparing/ready order is cancelled (`CANCELLED`).

### 3.7. Customer Management & Service
- Store-scoped customer registry automatically populated/updated from digital and manual orders or created directly.
- Displays customer name, phone number, total orders count, total spent, and last order timestamp.
- Detailed customer drawer/view with full order history.
- Direct **WhatsApp Quick Action** (`https://wa.me/...`) pre-filled with contextual message (no paid WhatsApp API required for MVP).

---

## 4. Visual Identity & UI/UX Standards

- **Aesthetic Direction:** Premium Dark SaaS inspired by Linear, Stripe Dashboard, and high-contrast POS boards.
- **Color Tokens:**
  - Primary Background: `#101010`
  - Secondary / Sidebar Background: `#1C1C1C`
  - Card / Surface Background: `#242424`
  - Primary Accent: `#FF6A00` (used intentionally for primary CTAs, active indicators, key chart bars, and status highlights)
  - Primary Text: `#F3F3F0`
  - Secondary Text: `#A1A1A1`
  - Border / Divider: `#333333`
- **Typography:**
  - Headings: `Manrope` or `Sora`
  - Body / UI: `Inter`
  - Numeric / Financials / Metrics: `tabular-nums` enforced across all prices, counters, and tables.
- **Wordmark:** `BENIT.` in bold uppercase geometric typography.

