import { dbInsert, dbPatch, dbSelect, getUserFromRequest, handleOptions, json, logSessionEvent } from './_lib.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json(res, 401, { error: 'Usuário não autenticado.' });

    const { sessionId, decisionPointId, optionId, note } = req.body || {};
    const [player] = await dbSelect('session_players', {
      select: '*',
      session_id: `eq.${sessionId}`,
      user_id: `eq.${user.id}`
    });
    if (!player) return json(res, 403, { error: 'Usuário não participa desta sessão.' });

    const existing = await dbSelect('session_decisions', {
      select: '*',
      session_id: `eq.${sessionId}`,
      decision_point_id: `eq.${decisionPointId}`,
      session_player_id: `eq.${player.id}`
    });

    const payload = {
      selected_option_id: optionId,
      note,
      submitted_at: new Date().toISOString()
    };

    const decision = existing[0]
      ? (await dbPatch('session_decisions', { id: `eq.${existing[0].id}` }, payload))[0]
      : (await dbInsert('session_decisions', [{
          session_id: sessionId,
          decision_point_id: decisionPointId,
          session_player_id: player.id,
          selected_option_id: optionId,
          note,
          submitted_at: new Date().toISOString()
        }]))[0];

    await dbPatch('game_sessions', { id: `eq.${sessionId}` }, { status: 'waiting' }, 'return=minimal');
    await logSessionEvent(sessionId, 'decision_submitted', { userId: user.id, decisionId: decision.id });
    return json(res, 200, { decision });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
