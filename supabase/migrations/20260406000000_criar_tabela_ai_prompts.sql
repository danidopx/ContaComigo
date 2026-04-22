CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(auth.jwt() ->> 'email', '') = 'dop.jr82@gmail.com';
$$;

-- Criação da tabela para armazenar os prompts de IA
CREATE TABLE IF NOT EXISTS public.ai_prompts (
    id UUID DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
    prompt_name VARCHAR(255) NOT NULL UNIQUE,
    prompt_content TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users,
    is_system_prompt BOOLEAN DEFAULT FALSE
);

-- Adiciona a função para atualizar `updated_at` automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$
LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_ai_prompts_updated_at ON public.ai_prompts;
CREATE TRIGGER update_ai_prompts_updated_at
BEFORE UPDATE ON public.ai_prompts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

-- Admins can view and edit all prompts
-- For now, we will allow all authenticated users to read system prompts and their own prompts
-- And only specific roles (e.g., 'admin') to create/update/delete system prompts
-- This will be refined in a later step when we implement admin role checks
CREATE POLICY "Allow users to read visible prompts"
ON public.ai_prompts
FOR SELECT
USING (
    public.is_admin_user()
    OR is_system_prompt = TRUE
    OR auth.uid() = user_id
);

CREATE POLICY "Allow users to insert allowed prompts"
ON public.ai_prompts
FOR INSERT
WITH CHECK (
    public.is_admin_user()
    OR (
        auth.uid() = user_id
        AND COALESCE(is_system_prompt, FALSE) = FALSE
    )
);

CREATE POLICY "Allow users to update allowed prompts"
ON public.ai_prompts
FOR UPDATE
USING (
    public.is_admin_user()
    OR (
        auth.uid() = user_id
        AND COALESCE(is_system_prompt, FALSE) = FALSE
    )
)
WITH CHECK (
    public.is_admin_user()
    OR (
        auth.uid() = user_id
        AND COALESCE(is_system_prompt, FALSE) = FALSE
    )
);

CREATE POLICY "Allow users to delete allowed prompts"
ON public.ai_prompts
FOR DELETE
USING (
    public.is_admin_user()
    OR (
        auth.uid() = user_id
        AND COALESCE(is_system_prompt, FALSE) = FALSE
    )
);
