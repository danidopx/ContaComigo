CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Criação da tabela para armazenar os registros das interações com a IA
CREATE TABLE IF NOT EXISTS public.ai_interactions (
    id UUID DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
    prompt_id UUID REFERENCES public.ai_prompts(id),
    model_used VARCHAR(255) NOT NULL,
    input_content TEXT NOT NULL,
    raw_response TEXT,
    parsed_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID REFERENCES auth.users
);

-- RLS Policies
ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view their own interactions
CREATE POLICY "Allow users to read their own AI interactions" 
ON public.ai_interactions FOR SELECT 
USING (auth.uid() = user_id);

-- Allow authenticated users to insert their own interactions
CREATE POLICY "Allow users to insert their own AI interactions" 
ON public.ai_interactions FOR INSERT 
WITH CHECK (auth.uid() = user_id);
