import { dbInsert, dbPatch, getSessionBundle, getUserFromRequest, handleOptions, json, logSessionEvent, userIsAdmin } from './_lib.js';
import { generateTransitionNarration } from './_narrative.js';

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
    const currentIndex = bundle.chapters.findIndex(item => item.id === bundle.chapter?.id);
    const sessionPath = Array.isArray(bundle.session.metadata?.path) ? bundle.session.metadata.path : [];
    const blockedNodeIds = new Set(sessionPath);
    const pendingNextNodeId = bundle.session.metadata?.pending_next_node_id;
    const fallbackChapter = bundle.chapters[currentIndex + 1];
    const nextChapter = pendingNextNodeId
      ? bundle.chapters.find(item => item.builder_node_id === pendingNextNodeId)
      : fallbackChapter;

    if (!nextChapter) {
      await dbPatch('game_sessions', { id: `eq.${sessionId}` }, { status: 'completed' }, 'return=minimal');
      await logSessionEvent(sessionId, 'session_completed', { chapterId: bundle.chapter?.id });
      return json(res, 200, { completed: true });
    }

    if (blockedNodeIds.has(nextChapter.builder_node_id) && nextChapter.node_type !== 'final') {
      await dbPatch('game_sessions', { id: `eq.${sessionId}` }, { status: 'completed' }, 'return=minimal');
      await logSessionEvent(sessionId, 'session_completed', { chapterId: bundle.chapter?.id, reason: 'loop_guard' });
      return json(res, 200, { completed: true, reason: 'loop_guard' });
    }

    const finalizing = nextChapter.node_type === 'final' || nextChapter.chapter_metadata?.isFinal === true;
    const transition = await generateTransitionNarration({
      bundle,
      nextChapter,
      nextNodeId: nextChapter.builder_node_id,
      finalizing
    });

    await dbPatch('game_sessions', { id: `eq.${sessionId}` }, {
      current_chapter_id: nextChapter.id,
      status: 'active',
      metadata: {
        ...(bundle.session.metadata || {}),
        pending_next_node_id: null,
        path: [...sessionPath, nextChapter.builder_node_id || nextChapter.id].filter(Boolean)
      }
    }, 'return=minimal');

    await dbInsert('session_chapter_states', [{
      session_id: sessionId,
      chapter_id: nextChapter.id,
      narration: transition.narration || nextChapter.opening_text,
      resolution_summary: finalizing ? transition.endingSummary : null,
      state_payload: {
        sourceNodeId: nextChapter.builder_node_id || null,
        finalizing
      },
      status: 'active'
    }], 'return=minimal');

    await logSessionEvent(sessionId, 'chapter_generated', { chapterId: nextChapter.id, nextNodeId: nextChapter.builder_node_id });
    return json(res, 200, { nextChapter });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
