import { generateWithGemini } from './_gemini.js';
import { dbInsert, dbPatch, dbSelect } from './_lib.js';

function extractText(payload) {
  return payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function clipText(value, max = 5000) {
  return String(value || '').slice(0, max);
}

function parseJsonEnvelope(text) {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {}
  }
  return null;
}

export async function loadPromptMap() {
  const prompts = await dbSelect('story_prompt_configs', {
    select: 'prompt_name,prompt_content,model_name',
    is_active: 'eq.true',
    deleted_at: 'is.null'
  });
  return prompts.reduce((map, item) => {
    map[item.prompt_name] = item;
    return map;
  }, {});
}

export function buildDecisionOutcome(bundle) {
  const decisionPoint = bundle.decisionPoint;
  const decisionOptions = bundle.decisionOptions || [];
  const relevantDecisions = (bundle.decisions || []).filter(item => item.decision_point_id === decisionPoint?.id);
  const counts = decisionOptions.map(option => ({
    option,
    count: relevantDecisions.filter(decision => decision.selected_option_id === option.id).length
  })).sort((left, right) => right.count - left.count || left.option.sort_order - right.option.sort_order);

  const winner = counts[0]?.option || decisionOptions[0] || null;
  const nextNodeId = winner?.option_metadata?.targetNodeId || winner?.option_metadata?.target_node_id || winner?.option_metadata?.targetNode || null;

  return {
    counts: counts.map(item => ({
      optionId: item.option.id,
      label: item.option.option_label,
      count: item.count
    })),
    winnerOptionId: winner?.id || null,
    winnerLabel: winner?.option_label || '',
    nextNodeId
  };
}

export async function maybeAdaptIntro(sessionId, bundle) {
  if (!bundle.chapterState || bundle.chapterState.state_payload?.introAdapted) return null;
  if (!(bundle.players || []).some(player => player.character)) return null;

  const prompts = await loadPromptMap();
  const prompt = prompts.adapt_intro_characters?.prompt_content || 'Adapte a abertura ao grupo atual em poucas linhas e mantendo o primeiro bloco.';
  const finalPrompt = `${prompt}

Capitulo atual: ${bundle.chapter?.title || ''}
Texto base: ${clipText(bundle.chapterState.narration || bundle.chapter?.opening_text || '', 1200)}
Grupo: ${JSON.stringify((bundle.players || []).map(player => ({
  nome: player.character?.name || player.profile?.full_name || player.user_id,
  classe: player.character?.class_name || '',
  origem: player.character?.origin || ''
})))}

Responda somente com a narracao adaptada.`;

  const generation = await generateWithGemini({
    prompt: finalPrompt,
    modelo: prompts.adapt_intro_characters?.model_name || 'gemini-2.5-flash'
  });
  const narration = extractText(generation.payload) || bundle.chapterState.narration || bundle.chapter?.opening_text || '';

  await dbPatch('session_chapter_states', { id: `eq.${bundle.chapterState.id}` }, {
    narration,
    state_payload: {
      ...(bundle.chapterState.state_payload || {}),
      introAdapted: true
    }
  }, 'return=minimal');

  await dbInsert('ai_generations', [{
    session_id: sessionId,
    story_id: bundle.story.id,
    chapter_id: bundle.chapter?.id,
    prompt_name: 'adapt_intro_characters',
    model_name: generation.model,
    input_payload: { players: bundle.players.map(player => player.character?.name || player.profile?.full_name || player.user_id) },
    raw_response: narration,
    parsed_response: { narration }
  }], 'return=minimal');

  return narration;
}

export async function generateTransitionNarration({ bundle, nextChapter, nextNodeId, finalizing = false }) {
  const prompts = await loadPromptMap();
  const promptName = finalizing ? 'finalize_story' : 'transition_blocks';
  const prompt = prompts[promptName]?.prompt_content
    || (finalizing ? 'Feche a historia de forma coerente, curta e definitiva em JSON.' : 'Conecte o bloco atual ao proximo com continuidade curta e objetiva.');
  const finalPrompt = `${prompt}

Capitulo atual: ${bundle.chapter?.title || ''}
Proximo bloco: ${nextChapter?.title || ''}
Estado da sessao: ${JSON.stringify({
  currentNodeId: bundle.chapter?.builder_node_id || null,
  nextNodeId,
  lastSummary: bundle.chapterState?.resolution_summary || '',
  globalImpact: bundle.chapterState?.global_impact || '',
  players: (bundle.players || []).map(player => player.character?.name || player.profile?.full_name || player.user_id),
  recentEvents: (bundle.events || []).slice(-8).map(event => ({
    type: event.event_type,
    payload: event.payload
  }))
})}

${finalizing ? 'Responda somente JSON com {"narration":"","endingSummary":""}.' : 'Responda somente com a narracao do proximo bloco.'}`;

  const generation = await generateWithGemini({
    prompt: finalPrompt,
    modelo: prompts[promptName]?.model_name || 'gemini-2.5-flash'
  });
  const text = extractText(generation.payload);
  const parsed = finalizing ? parseJsonEnvelope(text) || {} : null;

  await dbInsert('ai_generations', [{
    session_id: bundle.session.id,
    story_id: bundle.story.id,
    chapter_id: nextChapter?.id || bundle.chapter?.id,
    prompt_name: promptName,
    model_name: generation.model,
    input_payload: { currentChapterId: bundle.chapter?.id, nextChapterId: nextChapter?.id, nextNodeId },
    raw_response: text,
    parsed_response: parsed || { narration: text }
  }], 'return=minimal');

  return {
    narration: finalizing ? (parsed.narration || nextChapter?.opening_text || text) : (text || nextChapter?.opening_text || ''),
    endingSummary: parsed?.endingSummary || ''
  };
}
