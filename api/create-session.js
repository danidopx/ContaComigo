import { assertEnv, dbInsert, dbSelect, getUserFromRequest, handleOptions, json, logSessionEvent } from './_lib.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });

  try {
    assertEnv();
    const user = await getUserFromRequest(req);
    if (!user) return json(res, 401, { error: 'Usuário não autenticado.' });

    const { storyId } = req.body || {};
    const [story] = await dbSelect('stories', { select: '*', id: `eq.${storyId}` });
    if (!story) return json(res, 404, { error: 'História não encontrada.' });

    const [firstChapter] = await dbSelect('story_chapters', {
      select: '*',
      story_id: `eq.${storyId}`,
      order: 'chapter_order.asc',
      limit: '1'
    });

    const [session] = await dbInsert('game_sessions', [{
      story_id: storyId,
      title: `${story.title} - Mesa`,
      host_user_id: user.id,
      current_chapter_id: firstChapter?.id || null,
      status: 'lobby'
    }]);

    const [player] = await dbInsert('session_players', [{
      session_id: session.id,
      user_id: user.id,
      is_host: true,
      status: 'joined'
    }]);

    if (firstChapter) {
      await dbInsert('session_chapter_states', [{
        session_id: session.id,
        chapter_id: firstChapter.id,
        narration: firstChapter.opening_text,
        status: 'active'
      }], 'return=minimal');
    }

    await logSessionEvent(session.id, 'session_created', { userId: user.id, playerId: player.id });
    return json(res, 200, { session, player });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
