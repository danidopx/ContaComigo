CREATE TABLE IF NOT EXISTS public.ai_settings (
    setting_key VARCHAR(255) PRIMARY KEY,
    setting_value TEXT NOT NULL DEFAULT '',
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users,
    is_system_setting BOOLEAN DEFAULT FALSE
);

CREATE TRIGGER update_ai_settings_updated_at
BEFORE UPDATE ON public.ai_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to read visible settings"
ON public.ai_settings
FOR SELECT
USING (
    public.is_admin_user()
    OR is_system_setting = TRUE
    OR auth.uid() = user_id
);

CREATE POLICY "Allow users to insert allowed settings"
ON public.ai_settings
FOR INSERT
WITH CHECK (
    public.is_admin_user()
    OR (
        auth.uid() = user_id
        AND COALESCE(is_system_setting, FALSE) = FALSE
    )
);

CREATE POLICY "Allow users to update allowed settings"
ON public.ai_settings
FOR UPDATE
USING (
    public.is_admin_user()
    OR (
        auth.uid() = user_id
        AND COALESCE(is_system_setting, FALSE) = FALSE
    )
)
WITH CHECK (
    public.is_admin_user()
    OR (
        auth.uid() = user_id
        AND COALESCE(is_system_setting, FALSE) = FALSE
    )
);

CREATE POLICY "Allow users to delete allowed settings"
ON public.ai_settings
FOR DELETE
USING (
    public.is_admin_user()
    OR (
        auth.uid() = user_id
        AND COALESCE(is_system_setting, FALSE) = FALSE
    )
);
