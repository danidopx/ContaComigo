import { dbDelete, dbInsert, dbPatch, dbSelect, getUserFromRequest, handleOptions, json, userIsAdmin } from './_lib.js';

const scopes = {
  stories: { table: 'stories', select: '*' },
  chapters: { table: 'story_chapters', select: '*' },
  decisions: { table: 'story_decision_points', select: '*' },
  decisionOptions: { table: 'story_decision_options', select: '*' },
  rules: { table: 'story_rules', select: '*' },
  sessions: { table: 'game_sessions', select: '*' }
};

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    const user = await getUserFromRequest(req);
    if (!user || !userIsAdmin(user)) return json(res, 403, { error: 'Acesso restrito ao admin.' });

    if (req.method === 'GET') {
      const scope = scopes[req.query.scope];
      if (!scope) return json(res, 400, { error: 'Scope inválido.' });
      const items = await dbSelect(scope.table, { select: scope.select, order: 'created_at.desc' });
      return json(res, 200, { items });
    }

    const { entity, data, id } = req.body || {};
    if (!entity) return json(res, 400, { error: 'Entity obrigatória.' });

    if (req.method === 'POST') {
      const [item] = await dbInsert(entity, [normalizePayload(entity, data)]);
      return json(res, 200, { item });
    }

    if (req.method === 'PATCH') {
      const [item] = await dbPatch(entity, { id: `eq.${id}` }, normalizePayload(entity, data));
      return json(res, 200, { item });
    }

    if (req.method === 'DELETE') {
      const item = await dbDelete(entity, { id: `eq.${id}` });
      return json(res, 200, { item });
    }

    return json(res, 405, { error: 'Método não permitido' });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

function normalizePayload(entity, data = {}) {
  const payload = { ...data };
  if (entity === 'stories') {
    payload.is_published = payload.is_published === true || payload.is_published === 'on' || payload.is_published === 'true';
    payload.min_players = Number(payload.min_players || 1);
    payload.max_players = Number(payload.max_players || 4);
    payload.tags = normalizeJsonArray(payload.tags);
  }
  if (entity === 'story_chapters') {
    payload.chapter_order = Number(payload.chapter_order || 1);
  }
  if (entity === 'story_decision_points') {
    payload.sort_order = Number(payload.sort_order || 1);
    payload.character_impact = normalizeJsonObject(payload.character_impact);
  }
  if (entity === 'story_decision_options') {
    payload.sort_order = Number(payload.sort_order || 1);
  }
  if (entity === 'story_prompt_configs') {
    payload.is_active = true;
  }
  return payload;
}

function normalizeJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value).split(',').map(item => item.trim()).filter(Boolean);
  }
}

function normalizeJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return { default: String(value) };
  }
}
