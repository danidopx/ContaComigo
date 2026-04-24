import { dbDelete, dbInsert, dbPatch, dbSelect, getUserFromRequest, handleOptions, json, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, userIsAdmin } from './_lib.js';

const scopes = {
  stories: { table: 'stories', select: '*' },
  chapters: { table: 'story_chapters', select: '*' },
  decisions: { table: 'story_decision_points', select: '*' },
  decisionOptions: { table: 'story_decision_options', select: '*' },
  rules: { table: 'story_rules', select: '*' },
  sessions: { table: 'game_sessions', select: '*' },
  users: { special: 'users' }
};

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    const user = await getUserFromRequest(req);
    if (!user || !userIsAdmin(user)) return json(res, 403, { error: 'Acesso restrito ao admin.' });

    if (req.method === 'GET') {
      const scope = scopes[req.query.scope];
      if (!scope) return json(res, 400, { error: 'Scope inválido.' });
      if (scope.special === 'users') {
        const users = await listAuthUsers();
        return json(res, 200, { items: users });
      }
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
      if (entity === 'auth_users') {
        const item = await updateAuthUser(id, data || {});
        return json(res, 200, { item });
      }
      const [item] = await dbPatch(entity, { id: `eq.${id}` }, normalizePayload(entity, data));
      return json(res, 200, { item });
    }

    if (req.method === 'DELETE') {
      if (entity === 'auth_users') {
        const item = await deleteAuthUser(id);
        return json(res, 200, { item });
      }
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

async function listAuthUsers() {
  const payload = await supabaseAuthAdmin('/users?page=1&per_page=100');
  return (payload.users || []).map(user => ({
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || user.user_metadata?.name || '',
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    banned_until: user.banned_until || null
  }));
}

async function updateAuthUser(id, data) {
  return supabaseAuthAdmin(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ban_duration: data.blocked ? '876000h' : 'none'
    })
  });
}

async function deleteAuthUser(id) {
  return supabaseAuthAdmin(`/users/${id}`, { method: 'DELETE' });
}

async function supabaseAuthAdmin(path, options = {}) {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente.');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error_description || 'Falha no Supabase Auth Admin.');
  return data;
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
