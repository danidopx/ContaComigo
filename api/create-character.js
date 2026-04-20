import { dbInsert, dbPatch, dbSelect, getUserFromRequest, handleOptions, json, logSessionEvent } from './_lib.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json(res, 401, { error: 'Usuário não autenticado.' });

    const { sessionId, name, class_name, origin, backstory, strength, intelligence, charisma, agility } = req.body || {};
    const [player] = await dbSelect('session_players', {
      select: '*',
      session_id: `eq.${sessionId}`,
      user_id: `eq.${user.id}`
    });
    if (!player) return json(res, 403, { error: 'Usuário não participa desta sessão.' });

    const existing = await dbSelect('session_characters', {
      select: '*',
      session_player_id: `eq.${player.id}`
    });

    const payload = {
      session_id: sessionId,
      session_player_id: player.id,
      name,
      class_name,
      origin,
      backstory,
      attributes: {
        strength: Number(strength || 0),
        intelligence: Number(intelligence || 0),
        charisma: Number(charisma || 0),
        agility: Number(agility || 0)
      }
    };

    const character = existing[0]
      ? (await dbPatch('session_characters', { id: `eq.${existing[0].id}` }, payload))[0]
      : (await dbInsert('session_characters', [payload]))[0];

    await dbPatch('game_sessions', { id: `eq.${sessionId}` }, { status: 'active' }, 'return=minimal');
    await logSessionEvent(sessionId, 'character_saved', { userId: user.id, characterId: character.id });
    return json(res, 200, { character });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
