CREATE TABLE IF NOT EXISTS public.player_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  origin text,
  class_name text,
  description text,
  system_name text NOT NULL DEFAULT 'generic',
  sheet_template text NOT NULL DEFAULT 'generic-flex',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS lore_description text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS system_base text NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS min_players integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_players integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS character_compatibility text NOT NULL DEFAULT 'generic-flex',
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS master_prompt text,
  ADD COLUMN IF NOT EXISTS world_context text,
  ADD COLUMN IF NOT EXISTS narrative_rules text,
  ADD COLUMN IF NOT EXISTS tone_style text;

ALTER TABLE public.story_chapters
  ADD COLUMN IF NOT EXISTS arc_title text;

ALTER TABLE public.story_decision_points
  ADD COLUMN IF NOT EXISTS marker_key text,
  ADD COLUMN IF NOT EXISTS chapter_arc text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS trigger_condition text,
  ADD COLUMN IF NOT EXISTS narrative_impact text,
  ADD COLUMN IF NOT EXISTS character_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS condition_rule text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 1;

ALTER TABLE public.session_characters
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS system_name text NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS sheet_template text NOT NULL DEFAULT 'generic-flex',
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS player_character_id uuid REFERENCES public.player_characters(id) ON DELETE SET NULL;

UPDATE public.session_characters
SET
  description = COALESCE(description, backstory),
  system_name = COALESCE(NULLIF(system_name, ''), 'generic'),
  sheet_template = COALESCE(NULLIF(sheet_template, ''), 'generic-flex'),
  custom_fields = COALESCE(custom_fields, '{}'::jsonb)
WHERE true;

CREATE INDEX IF NOT EXISTS player_characters_user_idx ON public.player_characters (user_id, system_name, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS stories_system_base_idx ON public.stories (system_base, is_published, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS decision_points_story_order_idx ON public.story_decision_points (chapter_id, sort_order) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_player_characters_updated_at ON public.player_characters;
CREATE TRIGGER trg_player_characters_updated_at BEFORE UPDATE ON public.player_characters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.player_characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS player_characters_self_select ON public.player_characters;
CREATE POLICY player_characters_self_select ON public.player_characters FOR SELECT USING (user_id = auth.uid() OR public.is_admin_user());
DROP POLICY IF EXISTS player_characters_self_insert ON public.player_characters;
CREATE POLICY player_characters_self_insert ON public.player_characters FOR INSERT WITH CHECK (user_id = auth.uid() OR public.is_admin_user());
DROP POLICY IF EXISTS player_characters_self_update ON public.player_characters;
CREATE POLICY player_characters_self_update ON public.player_characters FOR UPDATE USING (user_id = auth.uid() OR public.is_admin_user()) WITH CHECK (user_id = auth.uid() OR public.is_admin_user());
DROP POLICY IF EXISTS player_characters_self_delete ON public.player_characters;
CREATE POLICY player_characters_self_delete ON public.player_characters FOR DELETE USING (user_id = auth.uid() OR public.is_admin_user());
