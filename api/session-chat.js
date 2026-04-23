import { dbInsert, dbSelect, getSessionBundle, getUserFromRequest, handleOptions, json, logSessionEvent, userIsAdmin } from './_lib.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json(res, 401, { error: 'Usuário não autenticado.' });

    if (req.method === 'GET') {
      const sessionId = req.query.sessionId;
      const bundle = await getSessionBundle(sessionId);
      const isParticipant = bundle.players.some(player => player.user_id === user.id);
      if (!isParticipant && !userIsAdmin(user)) return json(res, 403, { error: 'Acesso negado à sessão.' });

      const events = await dbSelect('session_events', {
        select: '*',
        session_id: `eq.${sessionId}`,
        event_type: 'eq.chat_message',
        order: 'created_at.asc'
      });

      return json(res, 200, {
        items: events.map(event => ({
          id: event.id,
          created_at: event.created_at,
          ...event.payload
        })),
        presets: Array.isArray(bundle.story?.chat_presets) ? bundle.story.chat_presets : []
      });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });

    const { sessionId, message } = req.body || {};
    if (!message) return json(res, 400, { error: 'Mensagem obrigatória.' });
    const bundle = await getSessionBundle(sessionId);
    const player = bundle.players.find(item => item.user_id === user.id);
    if (!player && !userIsAdmin(user)) return json(res, 403, { error: 'Acesso negado à sessão.' });

    await logSessionEvent(sessionId, 'chat_message', {
      userId: user.id,
      playerId: player?.id || null,
      author: player?.character?.name || player?.profile?.full_name || user.email || 'Jogador',
      message: String(message).slice(0, 600)
    });

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
