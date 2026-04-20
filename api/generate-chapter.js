import { dbInsert, dbPatch, getSessionBundle, getUserFromRequest, handleOptions, json, logSessionEvent, userIsAdmin } from './_lib.js';

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
    const nextChapter = bundle.chapters[currentIndex + 1];

    if (!nextChapter) {
      await dbPatch('game_sessions', { id: `eq.${sessionId}` }, { status: 'completed' }, 'return=minimal');
      await logSessionEvent(sessionId, 'session_completed', { chapterId: bundle.chapter?.id });
      return json(res, 200, { completed: true });
    }

    await dbPatch('game_sessions', { id: `eq.${sessionId}` }, {
      current_chapter_id: nextChapter.id,
      status: 'active'
    }, 'return=minimal');

    await dbInsert('session_chapter_states', [{
      session_id: sessionId,
      chapter_id: nextChapter.id,
      narration: nextChapter.opening_text,
      status: 'active'
    }], 'return=minimal');

    await logSessionEvent(sessionId, 'chapter_generated', { chapterId: nextChapter.id });
    return json(res, 200, { nextChapter });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
