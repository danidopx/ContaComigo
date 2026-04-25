import { generateWithGemini } from './_gemini.js';
import {
  dbDelete,
  dbInsert,
  dbPatch,
  dbSelect,
  getUserFromRequest,
  handleOptions,
  json,
  userIsAdmin
} from './_lib.js';
import {
  buildInitialBuilderFromGeneration,
  compileBuilderState,
  createDefaultBuilderState,
  normalizeBuilderState
} from './_story-builder.js';

function extractText(payload) {
  return payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function safeJsonFromText(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }
  return null;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'historia-sem-titulo';
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function extractField(text, label) {
  const regex = new RegExp(`${label}:\\s*(.*)`, 'i');
  const match = String(text || '').match(regex);
  return match?.[1]?.trim() || '';
}

function buildFallbackStoryForm(story, input = {}) {
  const description = input.guidedDescription || input.premise || '';
  const title = input.title || extractField(description, 'Título provisório') || story.title || 'Nova história';
  const theme = extractField(description, 'Tema central');
  const start = extractField(description, 'Como a história começa');
  const conflicts = extractField(description, 'Possíveis conflitos');
  const ending = extractField(description, 'Como imagina o final');
  const players = extractField(description, 'Quantidade de jogadores');
  const [minPlayersRaw, maxPlayersRaw] = players.split('-').map(item => Number(item.trim()));
  return {
    title,
    slug: slugify(title),
    summary: extractField(description, 'Resumo da premissa') || story.summary || 'Campanha gerada a partir de descrição guiada.',
    lore_description: description || story.lore_description || '',
    cover_text: start || 'Uma nova campanha pronta para ser explorada.',
    cover_url: `Prompt de imagem: ${extractField(description, 'Ambientação') || title}`,
    status: 'draft',
    system_base: 'generic',
    min_players: minPlayersRaw || story.min_players || 1,
    max_players: maxPlayersRaw || maxPlayersRaw || story.max_players || 4,
    character_compatibility: story.character_compatibility || 'generic-flex',
    tags: normalizeTags([input.genre, theme, conflicts].filter(Boolean)),
    master_prompt: `Conduza a campanha com foco em ${theme || 'coerência narrativa'} e progressão até um final claro.`,
    world_context: extractField(description, 'Ambientação') || story.world_context || '',
    narrative_rules: extractField(description, 'Restrições e observações') || story.narrative_rules || '',
    tone_style: input.tone || extractField(description, 'Tom') || story.tone_style || '',
    is_published: false
  };
}

function buildFallbackGeneratedPayload(storyForm, input = {}) {
  const beginning = extractField(input.guidedDescription || input.premise || '', 'Como a história começa') || 'Apresente o grupo e o gatilho inicial.';
  const middle = extractField(input.guidedDescription || input.premise || '', 'Possíveis conflitos') || 'Escaladas, alianças e decisões importantes.';
  const ending = extractField(input.guidedDescription || input.premise || '', 'Como imagina o final') || 'Um confronto final com consequência definitiva.';
  return {
    story: storyForm,
    settings: {
      narrativeModel: input.narrativeModel || extractField(input.guidedDescription || '', 'Tipo de jornada') || '3 atos',
      genre: input.genre || '',
      tone: storyForm.tone_style || '',
      macro: {
        inicio: beginning,
        meio: middle,
        final: ending
      }
    },
    nodes: [
      { id: 'start-1', type: 'start', data: { title: 'Início', text: beginning } },
      { id: 'ato-1', type: 'ato', data: { title: 'Meio', text: middle } },
      { id: 'decisao_grupo-1', type: 'decisao_grupo', data: { title: 'Decisão do grupo', text: 'Escolham um rumo central da campanha.', options: [{ id: 'opt-1', label: 'Seguir o plano principal', text: '', targetNodeId: 'boss-1' }, { id: 'opt-2', label: 'Assumir mais risco', text: '', targetNodeId: 'boss-1' }] } },
      { id: 'boss-1', type: 'boss', data: { title: 'Conflito final', text: ending } },
      { id: 'final-1', type: 'final', data: { title: 'Desfecho', text: ending } }
    ],
    edges: [
      { source: 'start-1', target: 'ato-1' },
      { source: 'ato-1', target: 'decisao_grupo-1' },
      { source: 'decisao_grupo-1', target: 'boss-1' },
      { source: 'boss-1', target: 'final-1' }
    ]
  };
}

function extractStoryPatch(settings = {}, fallbackStory = {}) {
  const storyForm = settings.storyForm || {};
  return {
    title: storyForm.title || fallbackStory.title || 'Nova história',
    slug: slugify(storyForm.slug || storyForm.title || fallbackStory.slug || fallbackStory.title || 'historia-sem-titulo'),
    summary: storyForm.summary || fallbackStory.summary || '',
    lore_description: storyForm.lore_description || fallbackStory.lore_description || '',
    cover_text: storyForm.cover_text || fallbackStory.cover_text || '',
    cover_url: normalizeExternalUrl(storyForm.cover_url || fallbackStory.cover_url || ''),
    status: storyForm.status || fallbackStory.status || 'draft',
    is_published: Boolean(storyForm.is_published ?? fallbackStory.is_published ?? false),
    system_base: storyForm.system_base || fallbackStory.system_base || 'generic',
    min_players: Number(storyForm.min_players || fallbackStory.min_players || 1),
    max_players: Number(storyForm.max_players || fallbackStory.max_players || 4),
    character_compatibility: storyForm.character_compatibility || fallbackStory.character_compatibility || 'generic-flex',
    tags: normalizeTags(storyForm.tags || fallbackStory.tags || []),
    master_prompt: storyForm.master_prompt || fallbackStory.master_prompt || '',
    world_context: storyForm.world_context || fallbackStory.world_context || '',
    narrative_rules: storyForm.narrative_rules || fallbackStory.narrative_rules || '',
    tone_style: storyForm.tone_style || fallbackStory.tone_style || ''
  };
}

function normalizeExternalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase().startsWith('prompt de imagem:')) return raw;
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? raw : '';
  } catch {
    return '';
  }
}

function validateGeneratedInput(input = {}) {
  const text = String(input.guidedDescription || input.premise || input.title || '').toLowerCase();
  const blocked = ['exploração sexual', 'abuso infantil', 'terrorismo real', 'instrução ilegal'];
  return blocked.some(term => text.includes(term))
    ? 'Conteúdo sensível detectado. A IA foi pulada e o fluxo seguiu com fallback editável.'
    : '';
}

function normalizeMediaMetadata(media = {}, storyPatch = {}) {
  const image = media.image || storyPatch.cover_url || '';
  return {
    image,
    imagePrompt: image && !String(image).startsWith('http') ? String(image) : '',
    ambientSound: media.ambientSound || media.music || '',
    music: media.music || '',
    acts: Array.isArray(media.acts) ? media.acts.filter(item => item?.sound) : []
  };
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    const user = await getUserFromRequest(req);
    if (!user || !userIsAdmin(user)) return json(res, 403, { error: 'Acesso restrito ao admin.' });

    if (req.method === 'GET') {
      const storyId = req.query.storyId;
      if (!storyId) return json(res, 400, { error: 'storyId obrigatório.' });
      const payload = await loadBuilderPayload(storyId);
      return json(res, 200, payload);
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });

    const { action, storyId, input, builderState, settings, chatPresets, mediaMetadata, note } = req.body || {};
    if (!storyId) return json(res, 400, { error: 'storyId obrigatório.' });

    if (action === 'save') {
      const payload = await saveDraft({ storyId, builderState, settings, chatPresets, mediaMetadata, note, userId: user.id });
      return json(res, 200, payload);
    }

    if (action === 'generate') {
      const payload = await generateBuilderBase({ storyId, input, settings, chatPresets, mediaMetadata });
      return json(res, 200, payload);
    }

    if (action === 'publish') {
      const payload = await publishBuilder({ storyId, builderState, settings, chatPresets, mediaMetadata, note, userId: user.id });
      return json(res, 200, payload);
    }

    return json(res, 400, { error: 'Ação inválida.' });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function loadBuilderPayload(storyId) {
  const [story] = await dbSelect('stories', {
    select: '*',
    id: `eq.${storyId}`,
    deleted_at: 'is.null'
  });
  if (!story) throw new Error('História não encontrada.');

  const versions = await dbSelect('story_builder_versions', {
    select: '*',
    story_id: `eq.${storyId}`,
    order: 'version_number.desc'
  });

  return {
    story,
    builderState: normalizeBuilderState(story.builder_state || createDefaultBuilderState()),
    settings: story.builder_settings || {},
    runtime: story.builder_runtime || {},
    chatPresets: Array.isArray(story.chat_presets) ? story.chat_presets : [],
    mediaMetadata: story.media_metadata || {},
    versions
  };
}

async function saveDraft({ storyId, builderState, settings, chatPresets, mediaMetadata, note, userId }) {
  const [story] = await dbSelect('stories', { select: '*', id: `eq.${storyId}`, deleted_at: 'is.null' });
  if (!story) throw new Error('História não encontrada.');

  const normalizedState = normalizeBuilderState(builderState);
  const runtime = compileBuilderState(story, normalizedState);
  const nextDraftVersion = Number(story.draft_version || 0) + 1;
  const storyPatch = extractStoryPatch(settings, story);

  await dbPatch('stories', { id: `eq.${storyId}` }, {
    ...storyPatch,
    builder_state: normalizedState,
    builder_settings: settings || story.builder_settings || {},
    builder_runtime: runtime,
    chat_presets: Array.isArray(chatPresets) ? chatPresets : story.chat_presets || [],
    media_metadata: normalizeMediaMetadata(mediaMetadata || story.media_metadata || {}, storyPatch),
    draft_version: nextDraftVersion,
    builder_checkpoint: 'FASE_3_BACKEND_SAVE'
  }, 'return=minimal');

  await dbInsert('story_builder_versions', [{
    story_id: storyId,
    version_number: nextDraftVersion,
    version_status: 'draft',
    builder_state: normalizedState,
    compiled_payload: runtime,
    notes: note || 'Rascunho salvo via builder.',
    created_by: userId
  }], 'return=minimal');

  return {
    ok: true,
    draftVersion: nextDraftVersion,
    runtime
  };
}

async function generateBuilderBase({ storyId, input, settings, chatPresets, mediaMetadata }) {
  const [story] = await dbSelect('stories', { select: '*', id: `eq.${storyId}`, deleted_at: 'is.null' });
  if (!story) throw new Error('História não encontrada.');

  const prompts = await dbSelect('story_prompt_configs', {
    select: 'prompt_name,prompt_content,model_name',
    prompt_name: 'eq.builder_structure_base',
    is_active: 'eq.true',
    deleted_at: 'is.null'
  });
  const basePrompt = prompts[0]?.prompt_content || 'Gere uma estrutura curta de historia em JSON para um builder narrativo.';
  const finalPrompt = `${basePrompt}

Tema: ${input?.title || story.title}
Premissa estruturada: ${input?.guidedDescription || input?.premise || story.summary || ''}
Genero: ${input?.genre || settings?.genre || 'fantasia'}
Tom: ${input?.tone || settings?.tone || 'dramatico'}
Modelo: ${input?.narrativeModel || settings?.narrativeModel || '3 atos'}

Responda somente JSON:
{
  "story": {
    "title": "",
    "slug": "",
    "summary": "",
    "lore_description": "",
    "cover_text": "",
    "cover_url": "",
    "status": "draft",
    "system_base": "generic",
    "min_players": 1,
    "max_players": 4,
    "character_compatibility": "generic-flex",
    "tags": [],
    "master_prompt": "",
    "world_context": "",
    "narrative_rules": "",
    "tone_style": ""
  },
  "settings": {
    "narrativeModel": "",
    "genre": "",
    "tone": "",
    "macro": {
      "inicio": "",
      "meio": "",
      "final": ""
    }
  },
  "nodes": [
    { "id": "start-1", "type": "start", "data": { "title": "", "text": "" } }
  ],
  "edges": [
    { "source": "start-1", "target": "evento-1", "label": "" }
  ]
}`;

  let rawText = '';
  let parsed = null;
  const validationWarning = validateGeneratedInput(input);
  if (!validationWarning) {
    try {
      const generation = await generateWithGemini({
        prompt: finalPrompt,
        modelo: prompts[0]?.model_name || 'gemini-2.5-flash'
      });
      rawText = extractText(generation.payload);
      parsed = safeJsonFromText(rawText);
    } catch {}
  }
  const storyForm = parsed?.story || buildFallbackStoryForm(story, input);
  const generatedEnvelope = parsed || buildFallbackGeneratedPayload(storyForm, input);
  const generatedState = buildInitialBuilderFromGeneration(input, generatedEnvelope);
  const runtime = compileBuilderState(story, generatedState);
  const storyPatch = extractStoryPatch({ storyForm }, story);

  await dbPatch('stories', { id: `eq.${storyId}` }, {
    ...storyPatch,
    builder_state: generatedState,
    builder_settings: {
      ...(story.builder_settings || {}),
      ...(settings || {}),
      ...(generatedEnvelope.settings || {}),
      title: storyPatch.title,
      premise: input?.guidedDescription || input?.premise || storyPatch.lore_description || '',
      genre: generatedEnvelope.settings?.genre || input?.genre || settings?.genre || '',
      tone: generatedEnvelope.settings?.tone || input?.tone || settings?.tone || '',
      narrativeModel: generatedEnvelope.settings?.narrativeModel || input?.narrativeModel || settings?.narrativeModel || '',
      guidedDescription: input?.guidedDescription || input?.premise || '',
      storyForm
    },
    builder_runtime: runtime,
    chat_presets: Array.isArray(chatPresets) ? chatPresets : story.chat_presets || [],
    media_metadata: normalizeMediaMetadata(mediaMetadata || story.media_metadata || {}, storyPatch),
    builder_checkpoint: 'FASE_5_IA_BASE'
  }, 'return=minimal');

  return {
    ok: true,
    rawText,
    storyForm,
    builderState: generatedState,
    runtime,
    warning: validationWarning || (parsed ? '' : 'A IA falhou ou respondeu parcialmente. O fluxo seguiu com fallback editável.')
  };
}

async function publishBuilder({ storyId, builderState, settings, chatPresets, mediaMetadata, note, userId }) {
  const [story] = await dbSelect('stories', { select: '*', id: `eq.${storyId}`, deleted_at: 'is.null' });
  if (!story) throw new Error('História não encontrada.');

  const blockingSessions = await dbSelect('game_sessions', {
    select: 'id,status',
    story_id: `eq.${storyId}`,
    status: 'in.(lobby,active,decision_pending,waiting,summary)',
    deleted_at: 'is.null'
  });
  if (blockingSessions.length > 0) {
    throw new Error('Existe sessão ativa usando esta história. Finalize ou cancele as mesas antes de publicar uma nova versão.');
  }

  const normalizedState = normalizeBuilderState(builderState || story.builder_state || createDefaultBuilderState());
  const runtime = compileBuilderState(story, normalizedState);
  const storyPatch = extractStoryPatch(settings, story);
  await syncPublishedStoryData(storyId, runtime);

  const publishedVersion = Number(story.draft_version || 1);
  await dbPatch('stories', { id: `eq.${storyId}` }, {
    ...storyPatch,
    builder_state: normalizedState,
    builder_settings: settings || story.builder_settings || {},
    builder_runtime: runtime,
    chat_presets: Array.isArray(chatPresets) ? chatPresets : story.chat_presets || [],
    media_metadata: normalizeMediaMetadata(mediaMetadata || story.media_metadata || {}, storyPatch),
    published_version: publishedVersion,
    status: 'published',
    is_published: true,
    builder_checkpoint: 'FASE_6_INTEGRACAO_PUBLICADA'
  }, 'return=minimal');

  await dbInsert('story_builder_versions', [{
    story_id: storyId,
    version_number: publishedVersion,
    version_status: 'published',
    builder_state: normalizedState,
    compiled_payload: runtime,
    notes: note || 'Versão publicada via builder.',
    created_by: userId
  }], 'return=minimal');

  return {
    ok: true,
    publishedVersion,
    runtime
  };
}

async function syncPublishedStoryData(storyId, runtime) {
  const existingChapters = await dbSelect('story_chapters', {
    select: '*',
    story_id: `eq.${storyId}`,
    order: 'chapter_order.asc'
  });

  const chapterByNodeId = new Map();

  for (let index = 0; index < runtime.chapters.length; index += 1) {
    const chapter = runtime.chapters[index];
    const existing = existingChapters[index];
    const payload = {
      story_id: storyId,
      chapter_order: chapter.chapterOrder,
      title: chapter.title,
      opening_text: chapter.openingText,
      chapter_goal: chapter.chapterGoal,
      arc_title: chapter.metadata.lane,
      builder_node_id: chapter.nodeId,
      node_type: chapter.nodeType,
      chapter_metadata: chapter.metadata,
      status: 'published',
      deleted_at: null
    };

    if (existing) {
      const [saved] = await dbPatch('story_chapters', { id: `eq.${existing.id}` }, payload);
      chapterByNodeId.set(chapter.nodeId, saved);
    } else {
      const [saved] = await dbInsert('story_chapters', [payload]);
      chapterByNodeId.set(chapter.nodeId, saved);
    }
  }

  for (let index = runtime.chapters.length; index < existingChapters.length; index += 1) {
    await dbPatch('story_chapters', { id: `eq.${existingChapters[index].id}` }, {
      deleted_at: new Date().toISOString(),
      status: 'archived',
      chapter_order: 1000 + index
    }, 'return=minimal');
  }

  for (const chapter of runtime.chapters) {
    const savedChapter = chapterByNodeId.get(chapter.nodeId);
    const decisions = runtime.decisionsByChapter[chapter.nodeId] || [];
    const existingPoints = await dbSelect('story_decision_points', {
      select: '*',
      chapter_id: `eq.${savedChapter.id}`,
      order: 'sort_order.asc'
    });

    for (let index = 0; index < decisions.length; index += 1) {
      const decision = decisions[index];
      const existing = existingPoints[index];
      const payload = {
        chapter_id: savedChapter.id,
        builder_node_id: decision.nodeId,
        decision_kind: decision.decisionKind,
        title: decision.title,
        description: decision.description,
        decision_prompt: decision.prompt,
        visibility_mode: decision.visibilityMode,
        marker_key: decision.nodeId,
        chapter_arc: chapter.metadata.lane,
        narrative_impact: 'Definido pelo builder dinamico.',
        condition_rule: '',
        sort_order: index + 1,
        decision_metadata: {
          targetNodeIds: decision.options.map(option => option.targetNodeId).filter(Boolean)
        },
        status: 'active',
        deleted_at: null
      };

      const point = existing
        ? (await dbPatch('story_decision_points', { id: `eq.${existing.id}` }, payload))[0]
        : (await dbInsert('story_decision_points', [payload]))[0];

      const existingOptions = await dbSelect('story_decision_options', {
        select: '*',
        decision_point_id: `eq.${point.id}`,
        order: 'sort_order.asc'
      });

      for (let optionIndex = 0; optionIndex < decision.options.length; optionIndex += 1) {
        const option = decision.options[optionIndex];
        const existingOption = existingOptions[optionIndex];
        const optionPayload = {
          decision_point_id: point.id,
          option_key: option.optionKey,
          builder_option_key: option.optionKey,
          option_label: option.label,
          option_description: option.description,
          consequence_hint: option.consequenceHint,
          sort_order: optionIndex + 1,
          option_metadata: {
            targetNodeId: option.targetNodeId
          },
          status: 'active',
          deleted_at: null
        };

        if (existingOption) {
          await dbPatch('story_decision_options', { id: `eq.${existingOption.id}` }, optionPayload, 'return=minimal');
        } else {
          await dbInsert('story_decision_options', [optionPayload], 'return=minimal');
        }
      }

      for (let optionIndex = decision.options.length; optionIndex < existingOptions.length; optionIndex += 1) {
        await dbDelete('story_decision_options', { id: `eq.${existingOptions[optionIndex].id}` });
      }
    }

    for (let index = decisions.length; index < existingPoints.length; index += 1) {
      const pointId = existingPoints[index].id;
      const existingOptions = await dbSelect('story_decision_options', {
        select: 'id',
        decision_point_id: `eq.${pointId}`
      });
      for (const option of existingOptions) {
        await dbDelete('story_decision_options', { id: `eq.${option.id}` });
      }
      await dbDelete('story_decision_points', { id: `eq.${pointId}` });
    }
  }
}
