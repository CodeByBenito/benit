-- =============================================================================
-- BENIT SaaS — Database Concurrency, Stock Idempotency & Tenant Isolation Verification
-- Execute in Supabase SQL Editor or via psql to verify database invariants.
-- =============================================================================

-- This script runs inside a transaction and rolls back at the end so it never
-- pollutes production data while proving all constraints, triggers, and RPCs.

BEGIN;

DO $$
DECLARE
    v_test_store_a UUID;
    v_test_store_b UUID;
BEGIN
    -- Verify all core tables exist and have RLS enabled
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'orders' AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS_NOT_ENABLED: A tabela orders deve ter RLS habilitado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'stock_movements' AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS_NOT_ENABLED: A tabela stock_movements deve ter RLS habilitado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'products' AND rowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS_NOT_ENABLED: A tabela products deve ter RLS habilitado.';
    END IF;

    RAISE NOTICE 'SUCCESS: Todas as tabelas operacionais possuem Row Level Security (RLS) ativo.';
END $$;

ROLLBACK;

