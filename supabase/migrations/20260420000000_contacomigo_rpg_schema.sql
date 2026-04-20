CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'player')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND deleted_at IS NULL
  )
  OR COALESCE(auth.jwt() ->> 'email', '') = COALESCE(current_setting('app.settings.admin_email', true), 'admin@example.com');
$$;

CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  summary text,
  cover_text text,
  status text NOT NULL DEFAULT 'draft',
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.story_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  chapter_order integer NOT NULL,
  title text NOT NULL,
  opening_text text,
  chapter_goal text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (story_id, chapter_order)
);

CREATE TABLE IF NOT EXISTS public.story_decision_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.story_chapters(id) ON DELETE CASCADE,
  title text NOT NULL,
  decision_prompt text NOT NULL,
  visibility_mode text NOT NULL DEFAULT 'visible' CHECK (visibility_mode IN ('visible', 'hidden', 'delayed_reveal')),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.story_decision_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_point_id uuid NOT NULL REFERENCES public.story_decision_points(id) ON DELETE CASCADE,
  option_key text NOT NULL DEFAULT 'option',
  option_label text NOT NULL,
  option_description text,
  consequence_hint text,
  sort_order integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (decision_point_id, option_key)
);

CREATE TABLE IF NOT EXISTS public.story_prompt_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid REFERENCES public.stories(id) ON DELETE CASCADE,
  prompt_name text NOT NULL UNIQUE,
  label text NOT NULL,
  prompt_content text NOT NULL,
  model_name text DEFAULT 'gemini-2.5-flash',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.story_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid REFERENCES public.stories(id) ON DELETE CASCADE,
  rule_name text NOT NULL,
  rule_content text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE RESTRICT,
  title text NOT NULL,
  host_user_id uuid NOT NULL REFERENCES auth.users(id),
  current_chapter_id uuid REFERENCES public.story_chapters(id),
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'decision_pending', 'waiting', 'summary', 'completed', 'cancelled')),
  max_players integer NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 1 AND 4),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.session_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_host boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'ready', 'left', 'removed')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.session_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  session_player_id uuid NOT NULL REFERENCES public.session_players(id) ON DELETE CASCADE,
  name text NOT NULL,
  class_name text NOT NULL,
  origin text NOT NULL,
  backstory text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (session_player_id)
);

CREATE TABLE IF NOT EXISTS public.session_chapter_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.story_chapters(id) ON DELETE CASCADE,
  narration text,
  resolution_summary text,
  global_impact text,
  individual_impacts jsonb NOT NULL DEFAULT '{}'::jsonb,
  state_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (session_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS public.session_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  decision_point_id uuid NOT NULL REFERENCES public.story_decision_points(id) ON DELETE CASCADE,
  session_player_id uuid NOT NULL REFERENCES public.session_players(id) ON DELETE CASCADE,
  selected_option_id uuid REFERENCES public.story_decision_options(id) ON DELETE SET NULL,
  note text,
  status text NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (decision_point_id, session_player_id)
);

CREATE TABLE IF NOT EXISTS public.session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  story_id uuid REFERENCES public.stories(id) ON DELETE SET NULL,
  chapter_id uuid REFERENCES public.story_chapters(id) ON DELETE SET NULL,
  prompt_name text NOT NULL,
  model_name text NOT NULL,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_response text,
  parsed_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text,
  setting_group text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_name text NOT NULL DEFAULT 'ContaComigo',
  environment_name text NOT NULL CHECK (environment_name IN ('preview', 'production')),
  current_version text NOT NULL,
  previous_version text,
  release_date timestamptz NOT NULL DEFAULT now(),
  responsible_name text,
  responsible_email text,
  deployment_url text,
  commit_ref text,
  release_notes text,
  source text NOT NULL DEFAULT 'manual',
  is_current boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.version_control AS
SELECT
  id,
  app_name,
  environment_name,
  current_version,
  previous_version,
  release_date,
  responsible_name,
  responsible_email,
  deployment_url,
  commit_ref,
  release_notes,
  source,
  is_current,
  is_public,
  created_by,
  created_at,
  updated_at
FROM public.app_versions;

CREATE INDEX IF NOT EXISTS stories_public_idx ON public.stories (is_published, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS story_chapters_story_order_idx ON public.story_chapters (story_id, chapter_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS story_decision_points_chapter_idx ON public.story_decision_points (chapter_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS story_decision_options_point_idx ON public.story_decision_options (decision_point_id, sort_order) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS game_sessions_story_status_idx ON public.game_sessions (story_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS session_players_session_user_idx ON public.session_players (session_id, user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS session_characters_session_idx ON public.session_characters (session_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS session_chapter_states_session_chapter_idx ON public.session_chapter_states (session_id, chapter_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS session_decisions_point_idx ON public.session_decisions (decision_point_id, session_player_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS session_events_session_idx ON public.session_events (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_generations_session_idx ON public.ai_generations (session_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS app_versions_one_current_per_environment_idx ON public.app_versions (environment_name) WHERE is_current = true;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_user_roles_updated_at ON public.user_roles;
CREATE TRIGGER trg_user_roles_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_stories_updated_at ON public.stories;
CREATE TRIGGER trg_stories_updated_at BEFORE UPDATE ON public.stories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_story_chapters_updated_at ON public.story_chapters;
CREATE TRIGGER trg_story_chapters_updated_at BEFORE UPDATE ON public.story_chapters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_story_decision_points_updated_at ON public.story_decision_points;
CREATE TRIGGER trg_story_decision_points_updated_at BEFORE UPDATE ON public.story_decision_points FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_story_decision_options_updated_at ON public.story_decision_options;
CREATE TRIGGER trg_story_decision_options_updated_at BEFORE UPDATE ON public.story_decision_options FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_story_prompt_configs_updated_at ON public.story_prompt_configs;
CREATE TRIGGER trg_story_prompt_configs_updated_at BEFORE UPDATE ON public.story_prompt_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_story_rules_updated_at ON public.story_rules;
CREATE TRIGGER trg_story_rules_updated_at BEFORE UPDATE ON public.story_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_game_sessions_updated_at ON public.game_sessions;
CREATE TRIGGER trg_game_sessions_updated_at BEFORE UPDATE ON public.game_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_session_players_updated_at ON public.session_players;
CREATE TRIGGER trg_session_players_updated_at BEFORE UPDATE ON public.session_players FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_session_characters_updated_at ON public.session_characters;
CREATE TRIGGER trg_session_characters_updated_at BEFORE UPDATE ON public.session_characters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_session_chapter_states_updated_at ON public.session_chapter_states;
CREATE TRIGGER trg_session_chapter_states_updated_at BEFORE UPDATE ON public.session_chapter_states FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_session_decisions_updated_at ON public.session_decisions;
CREATE TRIGGER trg_session_decisions_updated_at BEFORE UPDATE ON public.session_decisions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_app_versions_updated_at ON public.app_versions;
CREATE TRIGGER trg_app_versions_updated_at BEFORE UPDATE ON public.app_versions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_decision_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_decision_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_prompt_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_chapter_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
CREATE POLICY profiles_self_select ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin_user());
DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
CREATE POLICY profiles_self_insert ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id OR public.is_admin_user());
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.is_admin_user()) WITH CHECK (auth.uid() = id OR public.is_admin_user());

DROP POLICY IF EXISTS roles_self_or_admin_select ON public.user_roles;
CREATE POLICY roles_self_or_admin_select ON public.user_roles FOR SELECT USING (user_id = auth.uid() OR public.is_admin_user());
DROP POLICY IF EXISTS roles_admin_manage ON public.user_roles;
CREATE POLICY roles_admin_manage ON public.user_roles FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS stories_public_or_admin_select ON public.stories;
CREATE POLICY stories_public_or_admin_select ON public.stories FOR SELECT USING ((is_published = true AND deleted_at IS NULL) OR public.is_admin_user());
DROP POLICY IF EXISTS stories_admin_manage ON public.stories;
CREATE POLICY stories_admin_manage ON public.stories FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS story_chapters_public_or_admin_select ON public.story_chapters;
CREATE POLICY story_chapters_public_or_admin_select ON public.story_chapters FOR SELECT USING (deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND (s.is_published = true OR public.is_admin_user())));
DROP POLICY IF EXISTS story_chapters_admin_manage ON public.story_chapters;
CREATE POLICY story_chapters_admin_manage ON public.story_chapters FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS decision_points_public_or_admin_select ON public.story_decision_points;
CREATE POLICY decision_points_public_or_admin_select ON public.story_decision_points FOR SELECT USING (deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.story_chapters c JOIN public.stories s ON s.id = c.story_id WHERE c.id = chapter_id AND (s.is_published = true OR public.is_admin_user())));
DROP POLICY IF EXISTS decision_points_admin_manage ON public.story_decision_points;
CREATE POLICY decision_points_admin_manage ON public.story_decision_points FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS decision_options_public_or_admin_select ON public.story_decision_options;
CREATE POLICY decision_options_public_or_admin_select ON public.story_decision_options FOR SELECT USING (deleted_at IS NULL AND EXISTS (SELECT 1 FROM public.story_decision_points p WHERE p.id = decision_point_id));
DROP POLICY IF EXISTS decision_options_admin_manage ON public.story_decision_options;
CREATE POLICY decision_options_admin_manage ON public.story_decision_options FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS prompt_configs_public_or_admin_select ON public.story_prompt_configs;
CREATE POLICY prompt_configs_public_or_admin_select ON public.story_prompt_configs FOR SELECT USING (deleted_at IS NULL);
DROP POLICY IF EXISTS prompt_configs_admin_manage ON public.story_prompt_configs;
CREATE POLICY prompt_configs_admin_manage ON public.story_prompt_configs FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS story_rules_public_or_admin_select ON public.story_rules;
CREATE POLICY story_rules_public_or_admin_select ON public.story_rules FOR SELECT USING (deleted_at IS NULL);
DROP POLICY IF EXISTS story_rules_admin_manage ON public.story_rules;
CREATE POLICY story_rules_admin_manage ON public.story_rules FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS game_sessions_member_or_admin_select ON public.game_sessions;
CREATE POLICY game_sessions_member_or_admin_select ON public.game_sessions FOR SELECT USING (
  public.is_admin_user()
  OR EXISTS (SELECT 1 FROM public.session_players sp WHERE sp.session_id = id AND sp.user_id = auth.uid() AND sp.deleted_at IS NULL)
);
DROP POLICY IF EXISTS game_sessions_member_insert ON public.game_sessions;
CREATE POLICY game_sessions_member_insert ON public.game_sessions FOR INSERT WITH CHECK (auth.uid() = host_user_id OR public.is_admin_user());
DROP POLICY IF EXISTS game_sessions_admin_update ON public.game_sessions;
CREATE POLICY game_sessions_admin_update ON public.game_sessions FOR UPDATE USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS session_players_member_or_admin_select ON public.session_players;
CREATE POLICY session_players_member_or_admin_select ON public.session_players FOR SELECT USING (
  public.is_admin_user() OR user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.session_players sp WHERE sp.session_id = session_id AND sp.user_id = auth.uid())
);
DROP POLICY IF EXISTS session_players_member_insert ON public.session_players;
CREATE POLICY session_players_member_insert ON public.session_players FOR INSERT WITH CHECK (user_id = auth.uid() OR public.is_admin_user());
DROP POLICY IF EXISTS session_players_admin_update ON public.session_players;
CREATE POLICY session_players_admin_update ON public.session_players FOR UPDATE USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS session_characters_member_or_admin_select ON public.session_characters;
CREATE POLICY session_characters_member_or_admin_select ON public.session_characters FOR SELECT USING (
  public.is_admin_user() OR EXISTS (
    SELECT 1 FROM public.session_players sp WHERE sp.id = session_player_id AND sp.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS session_characters_member_insert ON public.session_characters;
CREATE POLICY session_characters_member_insert ON public.session_characters FOR INSERT WITH CHECK (
  public.is_admin_user() OR EXISTS (
    SELECT 1 FROM public.session_players sp WHERE sp.id = session_player_id AND sp.user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS session_characters_member_update ON public.session_characters;
CREATE POLICY session_characters_member_update ON public.session_characters FOR UPDATE USING (
  public.is_admin_user() OR EXISTS (
    SELECT 1 FROM public.session_players sp WHERE sp.id = session_player_id AND sp.user_id = auth.uid()
  )
) WITH CHECK (
  public.is_admin_user() OR EXISTS (
    SELECT 1 FROM public.session_players sp WHERE sp.id = session_player_id AND sp.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS session_chapter_states_member_or_admin_select ON public.session_chapter_states;
CREATE POLICY session_chapter_states_member_or_admin_select ON public.session_chapter_states FOR SELECT USING (
  public.is_admin_user() OR EXISTS (SELECT 1 FROM public.session_players sp WHERE sp.session_id = session_id AND sp.user_id = auth.uid())
);
DROP POLICY IF EXISTS session_chapter_states_admin_manage ON public.session_chapter_states;
CREATE POLICY session_chapter_states_admin_manage ON public.session_chapter_states FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS session_decisions_member_or_admin_select ON public.session_decisions;
CREATE POLICY session_decisions_member_or_admin_select ON public.session_decisions FOR SELECT USING (
  public.is_admin_user() OR EXISTS (SELECT 1 FROM public.session_players sp WHERE sp.id = session_player_id AND sp.user_id = auth.uid())
);
DROP POLICY IF EXISTS session_decisions_member_insert ON public.session_decisions;
CREATE POLICY session_decisions_member_insert ON public.session_decisions FOR INSERT WITH CHECK (
  public.is_admin_user() OR EXISTS (SELECT 1 FROM public.session_players sp WHERE sp.id = session_player_id AND sp.user_id = auth.uid())
);
DROP POLICY IF EXISTS session_decisions_member_update ON public.session_decisions;
CREATE POLICY session_decisions_member_update ON public.session_decisions FOR UPDATE USING (
  public.is_admin_user() OR EXISTS (SELECT 1 FROM public.session_players sp WHERE sp.id = session_player_id AND sp.user_id = auth.uid())
) WITH CHECK (
  public.is_admin_user() OR EXISTS (SELECT 1 FROM public.session_players sp WHERE sp.id = session_player_id AND sp.user_id = auth.uid())
);

DROP POLICY IF EXISTS session_events_member_or_admin_select ON public.session_events;
CREATE POLICY session_events_member_or_admin_select ON public.session_events FOR SELECT USING (
  public.is_admin_user() OR EXISTS (SELECT 1 FROM public.session_players sp WHERE sp.session_id = session_id AND sp.user_id = auth.uid())
);
DROP POLICY IF EXISTS session_events_admin_insert ON public.session_events;
CREATE POLICY session_events_admin_insert ON public.session_events FOR INSERT WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS ai_generations_admin_only ON public.ai_generations;
CREATE POLICY ai_generations_admin_only ON public.ai_generations FOR SELECT USING (public.is_admin_user());
DROP POLICY IF EXISTS ai_generations_admin_insert ON public.ai_generations;
CREATE POLICY ai_generations_admin_insert ON public.ai_generations FOR INSERT WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS app_settings_public_read ON public.app_settings;
CREATE POLICY app_settings_public_read ON public.app_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS app_settings_admin_manage ON public.app_settings;
CREATE POLICY app_settings_admin_manage ON public.app_settings FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS app_versions_public_read ON public.app_versions;
CREATE POLICY app_versions_public_read ON public.app_versions FOR SELECT USING (is_public = true OR public.is_admin_user());
DROP POLICY IF EXISTS app_versions_admin_manage ON public.app_versions;
CREATE POLICY app_versions_admin_manage ON public.app_versions FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

INSERT INTO public.app_settings (setting_key, setting_value, setting_group)
VALUES
  ('app_name', 'ContaComigo', 'general'),
  ('auth_google_enabled', 'true', 'auth'),
  ('ai_default_model', 'gemini-2.5-flash', 'ai')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO public.story_prompt_configs (prompt_name, label, prompt_content, model_name)
VALUES
  ('narration_main', 'Narração principal', 'Você é o narrador principal de um RPG cooperativo. Continue a história em português do Brasil mantendo coerência, tensão e consequências reais.', 'gemini-2.5-flash'),
  ('chapter_continue', 'Continuação de capítulo', 'Continue o capítulo atual após receber o contexto da sessão, regras e decisões. Responda em JSON.', 'gemini-2.5-flash'),
  ('interpret_decisions', 'Interpretação de decisões', 'Interprete as decisões conjuntas dos jogadores, respeitando escolhas ocultas, visíveis e reveladas depois.', 'gemini-2.5-flash'),
  ('session_summary', 'Resumo da sessão', 'Resuma a rodada em tom objetivo e dramático, destacando eventos, riscos e desdobramentos.', 'gemini-2.5-flash'),
  ('impact_individual', 'Impacto individual', 'Descreva impacto individual por personagem considerando classe, atributos e decisão tomada.', 'gemini-2.5-flash'),
  ('impact_global', 'Impacto global', 'Descreva impacto global na história, no mundo e no estado do grupo.', 'gemini-2.5-flash'),
  ('fallback', 'Fallback', 'Se faltar contexto, gere um resultado conservador, coerente e jogável.', 'gemini-2.5-flash')
ON CONFLICT (prompt_name) DO NOTHING;

WITH inserted_story AS (
  INSERT INTO public.stories (title, slug, summary, cover_text, status, is_published)
  VALUES ('As Cinzas de Eldria', 'as-cinzas-de-eldria', 'Uma campanha cooperativa sobre ruínas mágicas, alianças frágeis e decisões coletivas.', 'O reino de Eldria se parte em capítulos. Cada mesa precisa decidir unida para sobreviver.', 'published', true)
  ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title
  RETURNING id
),
story_ref AS (
  SELECT id FROM inserted_story
  UNION ALL
  SELECT id FROM public.stories WHERE slug = 'as-cinzas-de-eldria' LIMIT 1
),
chapter_one AS (
  INSERT INTO public.story_chapters (story_id, chapter_order, title, opening_text, chapter_goal, status)
  SELECT id, 1, 'O Portão Partido', 'Os quatro viajantes chegam ao Portão Partido quando a névoa rubra começa a engolir a estrada.', 'Descobrir como atravessar a ruína sem romper o selo antigo.', 'published'
  FROM story_ref
  ON CONFLICT (story_id, chapter_order) DO NOTHING
  RETURNING id, story_id
),
chapter_one_ref AS (
  SELECT id, story_id FROM chapter_one
  UNION ALL
  SELECT id, story_id FROM public.story_chapters WHERE chapter_order = 1 AND story_id = (SELECT id FROM story_ref LIMIT 1) LIMIT 1
),
chapter_two AS (
  INSERT INTO public.story_chapters (story_id, chapter_order, title, opening_text, chapter_goal, status)
  SELECT id, 2, 'Os Ecos da Câmara', 'Após cruzar o portão, o grupo encontra uma câmara viva que responde às escolhas feitas no primeiro capítulo.', 'Enfrentar as consequências e decidir o preço da passagem.', 'published'
  FROM story_ref
  ON CONFLICT (story_id, chapter_order) DO NOTHING
  RETURNING id
),
decision_one AS (
  INSERT INTO public.story_decision_points (chapter_id, title, decision_prompt, visibility_mode, status)
  SELECT id, 'Como atravessar o portão?', 'Escolham a abordagem principal para atravessar o Portão Partido.', 'visible', 'active'
  FROM chapter_one_ref
  ON CONFLICT DO NOTHING
  RETURNING id
),
decision_one_ref AS (
  SELECT id FROM decision_one
  UNION ALL
  SELECT id FROM public.story_decision_points WHERE chapter_id = (SELECT id FROM chapter_one_ref LIMIT 1) LIMIT 1
)
INSERT INTO public.story_decision_options (decision_point_id, option_key, option_label, option_description, consequence_hint, sort_order, status)
SELECT id, 'ritual', 'Executar um ritual conjunto', 'Todos combinam suas forças para reativar o selo.', 'Reduz o risco imediato, mas cobra energia individual.', 1, 'active' FROM decision_one_ref
UNION ALL
SELECT id, 'forca', 'Forçar a passagem', 'Atravessar rapidamente antes da névoa fechar.', 'Ganha tempo, mas pode ferir o grupo e quebrar alianças.', 2, 'active' FROM decision_one_ref
UNION ALL
SELECT id, 'negociar', 'Negociar com a entidade do portão', 'Tentar um pacto com a consciência adormecida na ruína.', 'Pode abrir caminho secreto, mas cobra um preço futuro.', 3, 'active' FROM decision_one_ref
ON CONFLICT DO NOTHING;
