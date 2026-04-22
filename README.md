# ContaComigo

Aplicação web de RPG narrativo com IA para até 4 jogadores simultâneos, preparada para deploy no Render.

## Stack reaproveitada

- Frontend SPA estática em `public/`
- Backend Node servindo a SPA e os handlers em `api/`
- Supabase para auth, banco, realtime e RLS
- Google OAuth via Supabase Auth
- Google Gemini no backend com o mesmo padrão de integração da base
- GitHub Actions + Render + versionamento em banco

## Estrutura

- `public/`: SPA do jogo, dashboard, lobby, capítulo, decisões e admin
- `api/`: handlers de sessão, decisões, IA, estado atual, admin e build/version
- `server.js`: servidor HTTP Node compatível com Render
- `render.yaml`: definição do serviço Render
- `supabase/migrations/`: schema completo do jogo e versionamento compatível
- `.github/workflows/supabase.yml`: validação e sync opcional de migrations no Supabase

## Variáveis de ambiente

Copie `.env.example` e configure no Render, Supabase e GitHub.

- `PORT`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`
- `GEMINI_KEY`
- `APP_ADMIN_EMAIL`

## Deploy

- Serviço Render: `srv-d7j4fsm7r5hc73cherc0`
- URL atual: `https://contacomigo-mk67.onrender.com`
- O Render pode fazer deploy automático a cada push se o repositório estiver conectado ao serviço.

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
