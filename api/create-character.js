import { dbInsert, dbPatch, dbSelect, getUserFromRequest, handleOptions, json, logSessionEvent } from './_lib.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json(res, 401, { error: 'Usuário não autenticado.' });

    const {
      sessionId,
      existingCharacterId,
      name,
      class_name,
      origin,
      backstory,
      description,
      system_name,
      sheet_template,
      custom_fields,
      strength,
      intelligence,
      charisma,
      agility
    } = req.body || {};
    const [session] = await dbSelect('game_sessions', { select: 'id, story_id', id: `eq.${sessionId}` });
    if (!session) return json(res, 404, { error: 'Sessão não encontrada.' });
    const [story] = await dbSelect('stories', { select: 'id, system_base, character_compatibility', id: `eq.${session.story_id}` });
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

    const imported = existingCharacterId
      ? (await dbSelect('player_characters', {
          select: '*',
          id: `eq.${existingCharacterId}`,
          user_id: `eq.${user.id}`
        }))[0]
      : null;

    const attributes = imported?.attributes || {
      strength: Number(strength || 0),
      intelligence: Number(intelligence || 0),
      charisma: Number(charisma || 0),
      agility: Number(agility || 0)
    };

    const libraryPayload = {
      user_id: user.id,
      name: imported?.name || name,
      class_name: imported?.class_name || class_name,
      origin: imported?.origin || origin,
      description: imported?.description || description || backstory,
      system_name: imported?.system_name || system_name || story?.system_base || 'generic',
      sheet_template: imported?.sheet_template || sheet_template || story?.character_compatibility || 'generic-flex',
      attributes,
      custom_fields: imported?.custom_fields || parseCustomFields(custom_fields),
      tags: imported?.tags || []
    };

    const playerCharacter = imported
      ? imported
      : (await dbInsert('player_characters', [libraryPayload]))[0];

    const payload = {
      session_id: sessionId,
      session_player_id: player.id,
      player_character_id: playerCharacter.id,
      name: playerCharacter.name,
      class_name: playerCharacter.class_name || 'Aventureiro',
      origin: playerCharacter.origin || 'Origem indefinida',
      backstory: playerCharacter.description || backstory,
      description: playerCharacter.description || description || backstory,
      system_name: playerCharacter.system_name,
      sheet_template: playerCharacter.sheet_template,
      attributes: playerCharacter.attributes || attributes,
      custom_fields: playerCharacter.custom_fields || {}
    };

    const character = existing[0]
      ? (await dbPatch('session_characters', { id: `eq.${existing[0].id}` }, payload))[0]
      : (await dbInsert('session_characters', [payload]))[0];

    await dbPatch('game_sessions', { id: `eq.${sessionId}` }, { status: 'active' }, 'return=minimal');
    await logSessionEvent(sessionId, 'character_saved', { userId: user.id, characterId: character.id, playerCharacterId: playerCharacter.id });
    return json(res, 200, { character, playerCharacter });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

function parseCustomFields(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { notes: String(raw) };
  }
}
