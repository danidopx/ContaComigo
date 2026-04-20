# ContaComigo

Aplicação web de RPG narrativo com IA para até 4 jogadores simultâneos, derivada diretamente do projeto `cv-edi-pro`.

## Stack reaproveitada

- Frontend SPA estática em `public/`
- Vercel Functions em `api/`
- Supabase para auth, banco, realtime e RLS
- Google OAuth via Supabase Auth
- Google Gemini no backend com o mesmo padrão de integração da base
- GitHub Actions + Vercel + versionamento em banco

## Estrutura

- `public/`: SPA do jogo, dashboard, lobby, capítulo, decisões e admin
- `api/`: handlers de sessão, decisões, IA, estado atual, admin e build/version
- `supabase/migrations/`: schema completo do jogo e versionamento compatível
- `.github/workflows/supabase.yml`: pipeline de preview, produção, banco e versionamento

## Variáveis de ambiente

Copie `.env.example` e configure no Supabase, Vercel e GitHub.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`
- `GEMINI_KEY`
- `APP_ADMIN_EMAIL`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_SCOPE`
- `VERCEL_PRODUCTION_DOMAIN`
- `VERCEL_PREVIEW_ALIAS`
- `STABLE_PREVIEW_BRANCH`

## Rodando

```bash
npm install
npm start
```

## Fluxo

1. Login com Google.
2. Escolha uma história.
3. Crie ou entre em uma sessão.
4. Cada jogador cria 1 personagem.
5. Todos enviam a decisão do capítulo.
6. A IA consolida rodada, gera impactos e move a sessão para o próximo capítulo.
7. O admin gerencia histórias, capítulos, decisões, prompts, regras e sessões.
