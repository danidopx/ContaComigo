import { appState, getSb, DEFAULT_PROMPTS_BY_NAME } from './config.js';
import { getAccessToken } from './auth.js';

async function request(path, options = {}) {
  const token = await getAccessToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Falha na API.');
  return payload;
}

export async function loadStories() {
  const sb = getSb();
  const { data, error } = await sb.from('stories').select('*').is('deleted_at', null).eq('is_published', true).order('created_at', { ascending: false });
  if (error) throw error;
  appState.stories = data || [];
  return appState.stories;
}

export async function loadMySessions() {
  const sb = getSb();
  if (!appState.user) return [];

  const { data, error } = await sb
    .from('session_players')
    .select(`
      id,
      joined_at,
      game_sessions (
        id,
        title,
        story_id,
        status,
        max_players,
        current_chapter_id,
        created_at,
        stories ( id, title, slug )
      )
    `)
    .eq('user_id', appState.user.id)
    .order('joined_at', { ascending: false });

  if (error) throw error;
  appState.sessions = (data || []).map(item => item.game_sessions).filter(Boolean);
  return appState.sessions;
}

export async function createSession(storyId) {
  return request('/api/create-session', { method: 'POST', body: JSON.stringify({ storyId }) });
}

export async function joinSession(sessionId) {
  return request('/api/join-session', { method: 'POST', body: JSON.stringify({ sessionId }) });
}

export async function createCharacter(sessionId, payload) {
  return request('/api/create-character', { method: 'POST', body: JSON.stringify({ sessionId, ...payload }) });
}

export async function submitDecision(sessionId, decisionPointId, optionId, note) {
  return request('/api/submit-decision', { method: 'POST', body: JSON.stringify({ sessionId, decisionPointId, optionId, note }) });
}

export async function fetchSessionStatus(sessionId) {
  return request(`/api/session-status?sessionId=${encodeURIComponent(sessionId)}`);
}

export async function consolidateRound(sessionId) {
  return request('/api/consolidate-round', { method: 'POST', body: JSON.stringify({ sessionId }) });
}

export async function generateNextChapter(sessionId) {
  return request('/api/generate-chapter', { method: 'POST', body: JSON.stringify({ sessionId }) });
}

export async function fetchCurrentState(sessionId) {
  const payload = await request(`/api/current-state?sessionId=${encodeURIComponent(sessionId)}`);
  appState.currentState = payload;
  appState.currentSession = payload.session || null;
  return payload;
}

export async function adminCrud(entity, method = 'GET', payload = {}) {
  const query = method === 'GET' && payload.scope ? `?scope=${encodeURIComponent(payload.scope)}` : '';
  return request(`/api/admin-crud${query}`, {
    method,
    body: method === 'GET' ? undefined : JSON.stringify({ entity, ...payload })
  });
}

export async function loadPromptConfigs() {
  const sb = getSb();
  const { data, error } = await sb.from('story_prompt_configs').select('*').is('deleted_at', null).order('prompt_name', { ascending: true });
  if (error) throw error;
  return data?.length ? data : Object.entries(DEFAULT_PROMPTS_BY_NAME).map(([prompt_name, item]) => ({
    prompt_name,
    label: item.label,
    prompt_content: item.content
  }));
}

export async function carregarVersaoAtualApp() {
  const sb = getSb();
  const { data } = await sb
    .from('app_versions')
    .select('current_version, environment_name, release_date')
    .eq('is_current', true)
    .order('release_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

export async function sincronizarVersaoAppNaTela() {
  const label = document.querySelector('[data-app-version-label]');
  const meta = document.querySelector('[data-app-version-meta]');
  if (!label) return;

  const version = await carregarVersaoAtualApp().catch(() => null);
  if (!version) return;

  label.textContent = `ContaComigo v${version.current_version}${version.environment_name === 'preview' ? ' - Preview' : ''}`;
  if (meta) meta.textContent = `${version.environment_name} | ${new Date(version.release_date).toLocaleString('pt-BR')}`;
}
