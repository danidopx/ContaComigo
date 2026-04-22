DROP POLICY IF EXISTS session_players_member_or_admin_select ON public.session_players;
CREATE POLICY session_players_member_or_admin_select
ON public.session_players
FOR SELECT
USING (
  public.is_admin_user()
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.game_sessions gs
    WHERE gs.id = session_id
      AND gs.host_user_id = auth.uid()
      AND gs.deleted_at IS NULL
  )
);
