const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const APP_ADMIN_EMAIL = process.env.APP_ADMIN_EMAIL || 'admin@example.com';

export function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function handleOptions(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
  }
}

export function json(res, status, payload) {
  withCors(res);
  return res.status(status).json(payload);
}

export function getToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

export async function getUserFromRequest(req) {
  const token = getToken(req);
  if (!token) return null;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) return null;
  return response.json();
}

export function userIsAdmin(user) {
  return Boolean(user?.email && user.email === APP_ADMIN_EMAIL);
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const stringified = query.toString();
  return stringified ? `?${stringified}` : '';
}

export async function dbSelect(table, params = {}, headers = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${buildQuery(params)}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...headers
    }
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data.message || `Erro ao consultar ${table}.`);
  return data;
}

export async function dbInsert(table, payload, prefer = 'return=representation') {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: prefer
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data.message || `Erro ao inserir em ${table}.`);
  return data;
}

export async function dbPatch(table, query, payload, prefer = 'return=representation') {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${buildQuery(query)}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: prefer
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data.message || `Erro ao atualizar ${table}.`);
  return data;
}

export async function dbDelete(table, query) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${buildQuery(query)}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation'
    }
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data.message || `Erro ao remover de ${table}.`);
  return data;
}

export async function getSessionBundle(sessionId) {
  const [sessions, players, characters, chapterStates, decisions] = await Promise.all([
    dbSelect('game_sessions', { select: '*', id: `eq.${sessionId}` }),
    dbSelect('session_players', { select: '*', session_id: `eq.${sessionId}`, order: 'joined_at.asc' }),
    dbSelect('session_characters', { select: '*', session_id: `eq.${sessionId}` }),
    dbSelect('session_chapter_states', { select: '*', session_id: `eq.${sessionId}`, order: 'created_at.desc' }),
    dbSelect('session_decisions', { select: '*', session_id: `eq.${sessionId}`, order: 'created_at.desc' })
  ]);

  const session = sessions[0];
  if (!session) throw new Error('Sessão não encontrada.');

  const [story] = await dbSelect('stories', { select: '*', id: `eq.${session.story_id}` });
  const chapters = await dbSelect('story_chapters', {
    select: '*',
    story_id: `eq.${session.story_id}`,
    order: 'chapter_order.asc'
  });

  const chapter = chapters.find(item => item.id === session.current_chapter_id) || chapters[0] || null;
  const decisionPoints = chapter ? await dbSelect('story_decision_points', {
    select: '*',
    chapter_id: `eq.${chapter.id}`,
    order: 'created_at.asc'
  }) : [];
  const decisionPoint = decisionPoints[0] || null;
  const decisionOptions = decisionPoint ? await dbSelect('story_decision_options', {
    select: '*',
    decision_point_id: `eq.${decisionPoint.id}`,
    order: 'sort_order.asc'
  }) : [];

  const profiles = players.length
    ? await dbSelect('profiles', { select: '*', id: `in.(${players.map(item => item.user_id).join(',')})` })
    : [];

  const playerMap = players.map(player => ({
    ...player,
    profile: profiles.find(profile => profile.id === player.user_id) || null,
    character: characters.find(character => character.session_player_id === player.id) || null
  }));

  const requiredCount = playerMap.length;
  const decidedCount = decisionPoint
    ? decisions.filter(item => item.decision_point_id === decisionPoint.id).length
    : 0;

  return {
    session,
    story,
    chapters,
    chapter,
    players: playerMap,
    chapterState: chapter ? chapterStates.find(item => item.chapter_id === chapter.id) || null : null,
    decisionPoint,
    decisionOptions,
    decisions,
    decisionStatus: {
      requiredCount,
      decidedCount,
      allDecided: requiredCount > 0 && requiredCount === decidedCount
    }
  };
}

export async function logSessionEvent(sessionId, eventType, payload = {}) {
  await dbInsert('session_events', [{
    session_id: sessionId,
    event_type: eventType,
    payload
  }], 'return=minimal');
}

export { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, APP_ADMIN_EMAIL };
