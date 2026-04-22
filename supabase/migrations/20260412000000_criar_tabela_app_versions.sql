CREATE TABLE IF NOT EXISTS public.app_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name TEXT NOT NULL DEFAULT 'CV Edi Pro',
    environment_name TEXT NOT NULL CHECK (environment_name IN ('preview', 'production')),
    current_version TEXT NOT NULL,
    previous_version TEXT,
    release_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    responsible_name TEXT,
    responsible_email TEXT,
    deployment_url TEXT,
    commit_ref TEXT,
    release_notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES auth.users,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_app_versions_updated_at ON public.app_versions;

CREATE TRIGGER update_app_versions_updated_at
BEFORE UPDATE ON public.app_versions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS app_versions_one_current_per_environment_idx
ON public.app_versions (environment_name)
WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS app_versions_environment_release_idx
ON public.app_versions (environment_name, release_date DESC);

ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read of visible app versions" ON public.app_versions;
CREATE POLICY "Allow public read of visible app versions"
ON public.app_versions
FOR SELECT
USING (is_public = TRUE OR public.is_admin_user());

DROP POLICY IF EXISTS "Allow admins to insert app versions" ON public.app_versions;
CREATE POLICY "Allow admins to insert app versions"
ON public.app_versions
FOR INSERT
WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "Allow admins to update app versions" ON public.app_versions;
CREATE POLICY "Allow admins to update app versions"
ON public.app_versions
FOR UPDATE
USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "Allow admins to delete app versions" ON public.app_versions;
CREATE POLICY "Allow admins to delete app versions"
ON public.app_versions
FOR DELETE
USING (public.is_admin_user());
