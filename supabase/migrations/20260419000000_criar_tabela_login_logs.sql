-- Criação da tabela para registrar os logins dos usuários
CREATE TABLE IF NOT EXISTS public.login_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    email VARCHAR(255),
    login_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN DEFAULT true
);

-- Cria índices para melhor performance nas buscas
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_timestamp ON public.login_logs(login_timestamp);
CREATE INDEX IF NOT EXISTS idx_login_logs_email ON public.login_logs(email);

-- RLS Policies
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view all login logs" ON public.login_logs;
DROP POLICY IF EXISTS "Users can view their own login logs" ON public.login_logs;
DROP POLICY IF EXISTS "System can insert login logs" ON public.login_logs;

-- Apenas o admin pode ver todos os logs
CREATE POLICY "Admin can view all login logs" 
ON public.login_logs FOR SELECT 
USING (auth.uid() = '7f3c24c3-3c9a-4d8e-9e5b-6b3c5c5c5c5c'::uuid OR auth.jwt() ->> 'role' = 'admin');

-- Usuários podem ver seus próprios logs de login
CREATE POLICY "Users can view their own login logs" 
ON public.login_logs FOR SELECT 
USING (auth.uid() = user_id);

-- O sistema pode inserir logs de login (será feito via uma função segura)
CREATE POLICY "System can insert login logs" 
ON public.login_logs FOR INSERT 
WITH CHECK (true);
