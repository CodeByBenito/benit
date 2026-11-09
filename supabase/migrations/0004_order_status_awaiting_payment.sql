-- =============================================================================
-- BENIT SaaS — Migration 0004: AWAITING_PAYMENT order status
-- Must run in its own transaction: Postgres does not allow a newly added enum
-- value to be used in the same transaction that adds it.
-- =============================================================================
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT' BEFORE 'NEW';
