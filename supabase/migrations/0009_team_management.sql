-- =============================================================================
-- BENIT SaaS — Migration 0009: Team management (members, roles, invitations)
--
-- `memberships` only had SELECT and INSERT policies, and `profiles` is readable
-- by its own user only, so the team screen needs controlled entry points:
--   list_team_members        read model (name, e-mail, role, scope, pending invite)
--   add_team_member          OWNER links an existing auth user to the org / a store
--   update_team_member_role  OWNER changes MANAGER / ATTENDANT / KITCHEN
--   remove_team_member       OWNER removes a member (never the last owner)
--
-- Inviting a brand-new e-mail is done by the app with the service role
-- (auth.admin.inviteUserByEmail); the membership itself is always created
-- here, as the calling OWNER, so the rules below cannot be skipped.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. READ MODEL
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_team_members(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_owner BOOLEAN;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão expirada.';
    END IF;

    v_is_owner := public.is_org_owner(p_org_id);

    -- Owners see everyone. Managers see the team of the stores they manage
    -- (plus organization-wide members). Attendants and kitchen see nothing.
    IF NOT v_is_owner AND NOT EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.organization_id = p_org_id AND m.user_id = auth.uid() AND m.role = 'MANAGER'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Apenas proprietário ou gerente podem ver a equipe.';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'membership_id', m.id,
        'user_id', m.user_id,
        'full_name', p.full_name,
        'email', p.email,
        'role', m.role,
        'store_id', m.store_id,
        'store_name', s.name,
        'pending', (u.invited_at IS NOT NULL AND u.last_sign_in_at IS NULL),
        'is_self', (m.user_id = auth.uid()),
        'created_at', m.created_at
    ) ORDER BY (m.role = 'OWNER') DESC, m.created_at, m.id), '[]'::jsonb)
    INTO v_result
    FROM public.memberships m
    JOIN public.profiles p ON p.id = m.user_id
    LEFT JOIN public.stores s ON s.id = m.store_id
    LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE m.organization_id = p_org_id
      AND (v_is_owner OR m.store_id IS NULL OR public.can_manage_store(m.store_id));

    RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. ADD A MEMBER (existing auth user, found by e-mail)
--    Returns {"status":"USER_NOT_FOUND"} when the e-mail has no account yet, so
--    the app can send the invitation and call again.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_team_member(
    p_org_id UUID,
    p_email TEXT,
    p_role public.membership_role,
    p_store_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := lower(trim(COALESCE(p_email, '')));
    v_user_id UUID;
    v_pending BOOLEAN;
    v_membership_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão expirada.';
    END IF;
    IF NOT public.is_org_owner(p_org_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Apenas o proprietário pode convidar pessoas para a equipe.';
    END IF;
    IF p_role IS NULL OR p_role = 'OWNER' THEN
        RAISE EXCEPTION 'INVALID_ROLE: Escolha Gerente, Atendente ou Cozinha.';
    END IF;
    IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'INVALID_EMAIL: Informe um e-mail válido.';
    END IF;
    IF p_store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'INVALID_STORE: Esta loja não pertence à sua organização.';
    END IF;

    SELECT u.id, (u.invited_at IS NOT NULL AND u.last_sign_in_at IS NULL)
    INTO v_user_id, v_pending
    FROM auth.users u
    WHERE lower(u.email) = v_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'USER_NOT_FOUND');
    END IF;
    IF v_user_id = auth.uid() THEN
        RAISE EXCEPTION 'ALREADY_MEMBER: Você já faz parte da equipe.';
    END IF;

    -- Serialize concurrent invitations of the same person.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

    -- The panel shows one organization per account: refuse an account that
    -- already works for (or owns) another organization.
    IF EXISTS (
        SELECT 1 FROM public.memberships m WHERE m.user_id = v_user_id AND m.organization_id <> p_org_id
    ) THEN
        RAISE EXCEPTION 'OTHER_ORGANIZATION: Este e-mail já está ligado a outro negócio no BENIT. Peça para a pessoa usar outro e-mail.';
    END IF;

    -- One organization-wide membership, or one per store: never both.
    IF EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = v_user_id
          AND m.organization_id = p_org_id
          AND (m.store_id IS NULL OR p_store_id IS NULL OR m.store_id = p_store_id)
    ) THEN
        RAISE EXCEPTION 'ALREADY_MEMBER: Esta pessoa já faz parte da equipe. Altere o papel dela na lista.';
    END IF;

    INSERT INTO public.memberships (organization_id, store_id, user_id, role)
    VALUES (p_org_id, p_store_id, v_user_id, p_role)
    RETURNING id INTO v_membership_id;

    RETURN jsonb_build_object(
        'status', 'ADDED',
        'membership_id', v_membership_id,
        'user_id', v_user_id,
        'pending', COALESCE(v_pending, false)
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. CHANGE A ROLE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_team_member_role(
    p_membership_id UUID,
    p_role public.membership_role
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member public.memberships%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão expirada.';
    END IF;

    SELECT * INTO v_member FROM public.memberships WHERE id = p_membership_id FOR UPDATE;
    -- Same answer for "does not exist" and "not yours": no probing across tenants.
    IF NOT FOUND OR NOT public.is_org_owner(v_member.organization_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Apenas o proprietário pode alterar papéis da equipe.';
    END IF;
    IF p_role IS NULL OR p_role = 'OWNER' THEN
        RAISE EXCEPTION 'INVALID_ROLE: Escolha Gerente, Atendente ou Cozinha.';
    END IF;
    IF v_member.role = 'OWNER' THEN
        RAISE EXCEPTION 'OWNER_ROLE_LOCKED: O papel de proprietário não pode ser alterado.';
    END IF;

    UPDATE public.memberships SET role = p_role WHERE id = p_membership_id;

    RETURN jsonb_build_object('membership_id', p_membership_id, 'role', p_role);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. REMOVE A MEMBER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_team_member(p_membership_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member public.memberships%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão expirada.';
    END IF;

    SELECT * INTO v_member FROM public.memberships WHERE id = p_membership_id FOR UPDATE;
    IF NOT FOUND OR NOT public.is_org_owner(v_member.organization_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Apenas o proprietário pode remover pessoas da equipe.';
    END IF;

    IF v_member.role = 'OWNER' AND v_member.store_id IS NULL THEN
        -- Lock every owner row of the organization so two owners cannot
        -- remove each other at the same time and leave it without one.
        PERFORM 1 FROM public.memberships m
        WHERE m.organization_id = v_member.organization_id AND m.role = 'OWNER' AND m.store_id IS NULL
        FOR UPDATE;

        IF NOT EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.organization_id = v_member.organization_id
              AND m.role = 'OWNER'
              AND m.store_id IS NULL
              AND m.id <> v_member.id
        ) THEN
            RAISE EXCEPTION 'LAST_OWNER: O negócio precisa de pelo menos um proprietário. Você não pode remover o último.';
        END IF;
    END IF;

    DELETE FROM public.memberships WHERE id = p_membership_id;

    RETURN jsonb_build_object('membership_id', p_membership_id, 'user_id', v_member.user_id, 'removed', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. PRIVILEGES — signed-in users only; each function checks the role itself.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.list_team_members(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_team_member(UUID, TEXT, public.membership_role, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_team_member_role(UUID, public.membership_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_team_member(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_team_members(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_team_member(UUID, TEXT, public.membership_role, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_team_member_role(UUID, public.membership_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_team_member(UUID) TO authenticated;
