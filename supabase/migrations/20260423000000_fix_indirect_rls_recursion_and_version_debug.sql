CREATE OR REPLACE FUNCTION public.is_session_member(target_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.session_players sp
    WHERE sp.session_id = target_session_id
      AND sp.user_id = auth.uid()
      AND sp.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_session_host(target_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.game_sessions gs
    WHERE gs.id = target_session_id
      AND gs.host_user_id = auth.uid()
      AND gs.deleted_at IS NULL
  );
$$;

DROP POLICY IF EXISTS game_sessions_member_or_admin_select ON public.game_sessions;
CREATE POLICY game_sessions_member_or_admin_select
ON public.game_sessions
FOR SELECT
USING (
  public.is_admin_user()
  OR public.is_session_member(id)
);

DROP POLICY IF EXISTS session_players_member_or_admin_select ON public.session_players;
CREATE POLICY session_players_member_or_admin_select
ON public.session_players
FOR SELECT
USING (
  public.is_admin_user()
  OR user_id = auth.uid()
  OR public.is_session_host(session_id)
);
