import { dbInsert, dbSelect, getUserFromRequest, handleOptions, json, logSessionEvent } from './_lib.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json(res, 401, { error: 'Usuário não autenticado.' });

    const { sessionId } = req.body || {};
    const [session] = await dbSelect('game_sessions', { select: '*', id: `eq.${sessionId}` });
    if (!session) return json(res, 404, { error: 'Sessão não encontrada.' });

    const existing = await dbSelect('session_players', {
      select: '*',
      session_id: `eq.${sessionId}`,
      user_id: `eq.${user.id}`
    });
    if (existing[0]) return json(res, 200, { player: existing[0], alreadyJoined: true });

    const players = await dbSelect('session_players', { select: 'id', session_id: `eq.${sessionId}` });
    if (players.length >= Number(session.max_players || 4)) {
      return json(res, 409, { error: 'Sessão já atingiu o limite de 4 jogadores.' });
    }

    const [player] = await dbInsert('session_players', [{
      session_id: sessionId,
      user_id: user.id,
      is_host: false,
      status: 'joined'
    }]);

    await logSessionEvent(sessionId, 'player_joined', { userId: user.id, playerId: player.id });
    return json(res, 200, { player });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
