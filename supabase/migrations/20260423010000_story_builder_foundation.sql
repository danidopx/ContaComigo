ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS builder_state jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS builder_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS builder_runtime jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS chat_presets jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS draft_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS published_version integer,
  ADD COLUMN IF NOT EXISTS builder_checkpoint text;

ALTER TABLE public.story_chapters
  ADD COLUMN IF NOT EXISTS builder_node_id text,
  ADD COLUMN IF NOT EXISTS node_type text NOT NULL DEFAULT 'event',
  ADD COLUMN IF NOT EXISTS chapter_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.story_decision_points
  ADD COLUMN IF NOT EXISTS builder_node_id text,
  ADD COLUMN IF NOT EXISTS decision_kind text NOT NULL DEFAULT 'group',
  ADD COLUMN IF NOT EXISTS decision_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.story_decision_options
  ADD COLUMN IF NOT EXISTS builder_option_key text,
  ADD COLUMN IF NOT EXISTS option_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.story_builder_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  version_status text NOT NULL DEFAULT 'draft' CHECK (version_status IN ('draft', 'published')),
  builder_state jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  compiled_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stories_builder_versions_idx ON public.story_builder_versions (story_id, version_number DESC);
CREATE INDEX IF NOT EXISTS story_chapters_builder_node_idx ON public.story_chapters (story_id, builder_node_id);
CREATE INDEX IF NOT EXISTS decision_points_builder_node_idx ON public.story_decision_points (chapter_id, builder_node_id);

ALTER TABLE public.story_builder_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS story_builder_versions_select ON public.story_builder_versions;
CREATE POLICY story_builder_versions_select ON public.story_builder_versions
FOR SELECT USING (
  public.is_admin_user()
  OR EXISTS (
    SELECT 1
    FROM public.stories s
    WHERE s.id = story_id
      AND s.is_published = true
  )
);

DROP POLICY IF EXISTS story_builder_versions_admin_manage ON public.story_builder_versions;
CREATE POLICY story_builder_versions_admin_manage ON public.story_builder_versions
FOR ALL USING (public.is_admin_user())
WITH CHECK (public.is_admin_user());

INSERT INTO public.story_prompt_configs (prompt_name, label, prompt_content, model_name)
VALUES
  ('builder_structure_base', 'Builder base', 'Gere uma estrutura curta de historia em JSON para um builder narrativo.', 'gemini-2.5-flash'),
  ('adapt_intro_characters', 'Ajuste de inicio', 'Adapte a abertura ao grupo atual em poucas linhas e mantendo o primeiro bloco.', 'gemini-2.5-flash'),
  ('transition_blocks', 'Transicao de blocos', 'Conecte o bloco atual ao proximo com continuidade curta e objetiva.', 'gemini-2.5-flash'),
  ('consolidate_decisions', 'Consolidacao de decisoes', 'Consolide as decisoes da rodada em JSON curto, sem loops e aproximando o grupo do final.', 'gemini-2.5-flash'),
  ('finalize_story', 'Finalizacao da historia', 'Feche a historia de forma coerente, curta e definitiva em JSON.', 'gemini-2.5-flash')
ON CONFLICT (prompt_name) DO NOTHING;
