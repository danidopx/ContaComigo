-- Criação da tabela de perfis extras para os usuários
CREATE TABLE IF NOT EXISTS public.perfis_usuarios (
    id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
    cpf VARCHAR(14),
    data_nascimento DATE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilita o RLS (Segurança de Linha) para que o usuário só veja o próprio CPF
ALTER TABLE public.perfis_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver o próprio perfil" 
ON public.perfis_usuarios FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Usuários podem atualizar o próprio perfil" 
ON public.perfis_usuarios FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Usuários podem inserir o próprio perfil" 
ON public.perfis_usuarios FOR INSERT 
WITH CHECK (auth.uid() = id);