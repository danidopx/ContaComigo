CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(auth.jwt() ->> 'email', '') = 'dop.jr82@gmail.com'
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'admin'
        AND deleted_at IS NULL
    );
$$;

DROP POLICY IF EXISTS roles_self_or_admin_select ON public.user_roles;
CREATE POLICY roles_self_or_admin_select
ON public.user_roles
FOR SELECT
USING (
  user_id = auth.uid()
  OR COALESCE(auth.jwt() ->> 'email', '') = 'dop.jr82@gmail.com'
);

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'dop.jr82@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
