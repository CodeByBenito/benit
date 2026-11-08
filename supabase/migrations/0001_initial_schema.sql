-- =============================================================================
-- BENIT SaaS — Migration 0001: Core Multi-Tenant Relational Schema (Hardened)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.membership_role AS ENUM ('OWNER', 'MANAGER', 'ATTENDANT', 'KITCHEN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.order_source AS ENUM ('DIGITAL_MENU', 'MANUAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.fulfillment_type AS ENUM ('DINE_IN', 'PICKUP', 'DELIVERY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.order_status AS ENUM ('NEW', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.stock_movement_type AS ENUM ('INITIAL', 'ENTRY', 'EXIT', 'ADJUSTMENT', 'ORDER_DEDUCTION', 'ORDER_REVERSAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 2. UTILITY TRIGGER FOR updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. PROFILES (1:1 with auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT,
    is_platform_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, phone)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'Usuário'),
        COALESCE(NEW.email, ''),
        NEW.raw_user_meta_data->>'phone'
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 4. ORGANIZATIONS, STORES & MEMBERSHIPS (Multi-Store & SaaS Plan Ready)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    document_number TEXT,
    plan_tier TEXT NOT NULL DEFAULT 'FREE_PILOT',
    subscription_status TEXT NOT NULL DEFAULT 'ACTIVE',
    max_stores INTEGER NOT NULL DEFAULT 1 CHECK (max_stores >= 1),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON public.organizations(created_by);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    phone TEXT,
    whatsapp TEXT,
    address TEXT,
    currency TEXT NOT NULL DEFAULT 'BRL',
    is_open BOOLEAN NOT NULL DEFAULT true,
    is_published BOOLEAN NOT NULL DEFAULT true,
    last_order_number INTEGER NOT NULL DEFAULT 0 CHECK (last_order_number >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_stores_organization_id ON public.stores(organization_id);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON public.stores(slug);

DROP TRIGGER IF EXISTS trg_stores_updated_at ON public.stores;
CREATE TRIGGER trg_stores_updated_at
    BEFORE UPDATE ON public.stores
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Memberships support either Organization-wide access (store_id IS NULL, e.g. OWNER)
-- or Store-specific access (store_id IS NOT NULL, e.g. branch MANAGER / ATTENDANT)
CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    store_id UUID,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role public.membership_role NOT NULL DEFAULT 'OWNER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_memberships_store_org
        FOREIGN KEY (store_id, organization_id)
        REFERENCES public.stores(id, organization_id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_org_user_all_stores
    ON public.memberships (organization_id, user_id)
    WHERE store_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_org_store_user
    ON public.memberships (organization_id, store_id, user_id)
    WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_organization_id ON public.memberships(organization_id);

DROP TRIGGER IF EXISTS trg_memberships_updated_at ON public.memberships;
CREATE TRIGGER trg_memberships_updated_at
    BEFORE UPDATE ON public.memberships
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 5. CATEGORIES, PRODUCTS & OPTIONS (With Composite Tenant Foreign Keys)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_categories_store_id_sort ON public.categories(store_id, sort_order);

DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    category_id UUID,
    sku TEXT,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    description TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    image_url TEXT,
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    track_stock BOOLEAN NOT NULL DEFAULT true,
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, store_id),
    CONSTRAINT fk_products_category_store
        FOREIGN KEY (category_id, store_id)
        REFERENCES public.categories(id, store_id)
        ON DELETE SET NULL (category_id)
);

CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.product_option_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    min_select INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
    max_select INTEGER NOT NULL DEFAULT 1 CHECK (max_select >= 1 AND max_select >= min_select),
    is_required BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, store_id),
    CONSTRAINT fk_option_groups_product_store
        FOREIGN KEY (product_id, store_id)
        REFERENCES public.products(id, store_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_option_groups_product_id ON public.product_option_groups(product_id);
CREATE INDEX IF NOT EXISTS idx_product_option_groups_store_id ON public.product_option_groups(store_id);

DROP TRIGGER IF EXISTS trg_product_option_groups_updated_at ON public.product_option_groups;
CREATE TRIGGER trg_product_option_groups_updated_at
    BEFORE UPDATE ON public.product_option_groups
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.product_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    group_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, store_id),
    CONSTRAINT fk_options_group_store
        FOREIGN KEY (group_id, store_id)
        REFERENCES public.product_option_groups(id, store_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_options_group_id ON public.product_options(group_id);
CREATE INDEX IF NOT EXISTS idx_product_options_store_id ON public.product_options(store_id);

DROP TRIGGER IF EXISTS trg_product_options_updated_at ON public.product_options;
CREATE TRIGGER trg_product_options_updated_at
    BEFORE UPDATE ON public.product_options
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 6. CUSTOMERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    phone TEXT NOT NULL CHECK (char_length(trim(phone)) >= 8),
    email TEXT,
    notes TEXT,
    total_orders INTEGER NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
    total_spent_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_spent_cents >= 0),
    last_order_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, phone),
    UNIQUE (id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_store_id ON public.customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_store_phone ON public.customers(store_id, phone);

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 7. ORDERS, ORDER ITEMS, OPTIONS & STATUS HISTORY (Composite Tenant Keys)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID,
    order_number INTEGER NOT NULL CHECK (order_number > 0),
    source public.order_source NOT NULL DEFAULT 'DIGITAL_MENU',
    fulfillment_type public.fulfillment_type NOT NULL DEFAULT 'PICKUP',
    table_or_reference TEXT,
    status public.order_status NOT NULL DEFAULT 'NEW',
    customer_name_snapshot TEXT NOT NULL,
    customer_phone_snapshot TEXT NOT NULL,
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
    fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    notes TEXT,
    stock_deducted BOOLEAN NOT NULL DEFAULT false,
    idempotency_key TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, order_number),
    UNIQUE (store_id, idempotency_key),
    UNIQUE (id, store_id),
    CONSTRAINT fk_orders_customer_store
        FOREIGN KEY (customer_id, store_id)
        REFERENCES public.customers(id, store_id)
        ON DELETE SET NULL (customer_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_store_id_status ON public.orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_store_id_created_at ON public.orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    product_id UUID,
    product_name_snapshot TEXT NOT NULL,
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    options_unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (options_unit_price_cents >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_item_cents INTEGER NOT NULL CHECK (total_item_cents >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, store_id),
    CONSTRAINT fk_order_items_order_store
        FOREIGN KEY (order_id, store_id)
        REFERENCES public.orders(id, store_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_order_items_product_store
        FOREIGN KEY (product_id, store_id)
        REFERENCES public.products(id, store_id)
        ON DELETE SET NULL (product_id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_store_id ON public.order_items(store_id);

CREATE TABLE IF NOT EXISTS public.order_item_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL,
    option_id UUID,
    group_name_snapshot TEXT NOT NULL,
    option_name_snapshot TEXT NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_order_item_options_item_store
        FOREIGN KEY (order_item_id, store_id)
        REFERENCES public.order_items(id, store_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_order_item_options_option_store
        FOREIGN KEY (option_id, store_id)
        REFERENCES public.product_options(id, store_id)
        ON DELETE SET NULL (option_id)
);

CREATE INDEX IF NOT EXISTS idx_order_item_options_order_item_id ON public.order_item_options(order_item_id);

CREATE TABLE IF NOT EXISTS public.order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    from_status public.order_status,
    to_status public.order_status NOT NULL,
    reason TEXT,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_order_status_history_order_store
        FOREIGN KEY (order_id, store_id)
        REFERENCES public.orders(id, store_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON public.order_status_history(order_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 8. STOCK MOVEMENTS LEDGER
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    order_id UUID,
    movement_type public.stock_movement_type NOT NULL,
    quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
    previous_quantity INTEGER NOT NULL CHECK (previous_quantity >= 0),
    new_quantity INTEGER NOT NULL CHECK (new_quantity >= 0),
    reference_key TEXT UNIQUE,
    reason TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_stock_movements_product_store
        FOREIGN KEY (product_id, store_id)
        REFERENCES public.products(id, store_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_stock_movements_order_store
        FOREIGN KEY (order_id, store_id)
        REFERENCES public.orders(id, store_id)
        ON DELETE SET NULL (order_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_store_id_created ON public.stock_movements(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order_id ON public.stock_movements(order_id);
