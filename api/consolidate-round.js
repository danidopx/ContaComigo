import { generateWithGemini } from './_gemini.js';
import { dbInsert, dbPatch, dbSelect, getSessionBundle, getUserFromRequest, handleOptions, json, logSessionEvent, userIsAdmin } from './_lib.js';
import { buildDecisionOutcome, loadPromptMap } from './_narrative.js';

function extractText(payload) {
  return payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseStructuredResult(text, bundle) {
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {}
  }

  const impacts = Object.fromEntries(bundle.players.map(player => [
    player.character?.name || player.profile?.full_name || player.user_id,
    'O personagem absorve as consequências da rodada e segue marcado pela escolha coletiva.'
  ]));

  return {
    summary: text || 'A rodada foi consolidada com sucesso.',
    globalImpact: 'O grupo alterou o rumo da história e abriu um novo estado para o capítulo seguinte.',
    individualImpacts: impacts,
    nextNodeId: bundle.chapter?.chapter_metadata?.nextNodeIds?.[0] || null
  };
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json(res, 401, { error: 'Usuário não autenticado.' });

    const sessionId = req.body?.sessionId;
    const bundle = await getSessionBundle(sessionId);
    const isParticipant = bundle.players.some(player => player.user_id === user.id);
    if (!isParticipant && !userIsAdmin(user)) return json(res, 403, { error: 'Acesso negado à sessão.' });
    if (!bundle.decisionStatus.allDecided) {
      return json(res, 409, { error: 'A rodada só pode ser consolidada quando todos decidirem.' });
    }

    const prompts = await loadPromptMap();
    const rules = await dbSelect('story_rules', {
      select: 'rule_name,rule_content',
      story_id: `eq.${bundle.story.id}`,
      deleted_at: 'is.null'
    });

    const promptBase = prompts.consolidate_decisions?.prompt_content
      || 'Consolide as decisoes da rodada em JSON curto, sem loops e aproximando o grupo do final.';
    const decisionOutcome = buildDecisionOutcome(bundle);

    const context = {
      story: bundle.story,
      chapter: bundle.chapter,
      players: bundle.players.map(player => ({
        player: player.profile?.full_name || player.user_id,
        character: player.character,
        decision: bundle.decisions.find(item => item.session_player_id === player.id)
      })),
      rules,
      decisionOutcome,
      recentEvents: (bundle.events || []).slice(-10).map(event => ({
        type: event.event_type,
        payload: event.payload
      }))
    };

    const finalPrompt = `${promptBase}

Contexto da sessão:
${JSON.stringify(context, null, 2)}

Responda somente JSON:
{
  "summary": "",
  "globalImpact": "",
  "nextNodeId": "${decisionOutcome.nextNodeId || ''}",
  "individualImpacts": {
    "nome_personagem": "impacto"
  }
}`;

    const generation = await generateWithGemini({
      prompt: finalPrompt,
      modelo: prompts.consolidate_decisions?.model_name || 'gemini-2.5-flash'
    });

    const rawText = extractText(generation.payload);
    const parsed = parseStructuredResult(rawText, bundle);
    parsed.nextNodeId = parsed.nextNodeId || decisionOutcome.nextNodeId || bundle.chapter?.chapter_metadata?.nextNodeIds?.[0] || null;
    const namedImpacts = {};
    bundle.players.forEach(player => {
      const key = player.character?.name || player.profile?.full_name || player.user_id;
      namedImpacts[player.character?.id || key] = parsed.individualImpacts?.[key] || parsed.individualImpacts?.[player.character?.id] || 'Impacto pendente.';
    });

    if (bundle.chapterState) {
      await dbPatch('session_chapter_states', { id: `eq.${bundle.chapterState.id}` }, {
        narration: bundle.chapterState.narration || bundle.chapter?.opening_text,
        resolution_summary: parsed.summary,
        global_impact: parsed.globalImpact,
        individual_impacts: namedImpacts,
        status: 'resolved'
      }, 'return=minimal');
    }

    await dbPatch('game_sessions', { id: `eq.${sessionId}` }, {
      status: 'summary',
      metadata: {
        ...(bundle.session.metadata || {}),
        pending_next_node_id: parsed.nextNodeId,
        path: [...(bundle.session.metadata?.path || []), bundle.chapter?.builder_node_id || bundle.chapter?.id].filter(Boolean),
        last_decision_summary: decisionOutcome
      }
    }, 'return=minimal');
    await dbInsert('ai_generations', [{
      session_id: sessionId,
      story_id: bundle.story.id,
      chapter_id: bundle.chapter?.id,
      prompt_name: 'consolidate_decisions',
      model_name: generation.model,
      input_payload: context,
      raw_response: rawText,
      parsed_response: parsed
    }], 'return=minimal');
    await logSessionEvent(sessionId, 'round_consolidated', parsed);

    return json(res, 200, parsed);
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
