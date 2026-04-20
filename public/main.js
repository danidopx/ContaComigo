import { appState, initPublicConfig } from './config.js';
import { initAuth, signInWithGoogle, signOut } from './auth.js';
import { loadStories, loadMySessions, createSession, joinSession, createCharacter, submitDecision, fetchSessionStatus, consolidateRound, generateNextChapter, fetchCurrentState, adminCrud, loadPromptConfigs, sincronizarVersaoAppNaTela } from './api.js';
import { bindSimpleNavigation, formToJson, setLoading, showScreen, toast } from './ui.js';
import { renderAdminList, renderChapter, renderLobby, renderSessions, renderStories, renderSummary } from './cv-builder.js';

let lastConsolidation = null;

function updateHeader() {
  const chip = document.getElementById('user-chip');
  const logout = document.getElementById('btn-logout');
  const admin = document.getElementById('btn-admin');
  const openAdmin = document.getElementById('btn-open-admin');

  if (appState.user) {
    chip.textContent = appState.user.user_metadata?.full_name || appState.user.email;
    chip.classList.remove('hidden');
    logout.classList.remove('hidden');
  } else {
    chip.classList.add('hidden');
    logout.classList.add('hidden');
  }

  const adminVisible = Boolean(appState.user && appState.isAdmin);
  admin.classList.toggle('hidden', !adminVisible);
  openAdmin.classList.toggle('hidden', !adminVisible);
}

async function refreshDashboard() {
  setLoading(true, 'Atualizando dashboard...');
  try {
    const [stories, sessions] = await Promise.all([loadStories(), loadMySessions()]);
    renderStories(document.getElementById('stories-list'), stories, async storyId => {
      const created = await createSession(storyId);
      toast('Sessão criada.');
      await openSession(created.session.id);
    });
    renderSessions(document.getElementById('sessions-list'), sessions, openSession, async sessionId => {
      await joinSession(sessionId);
      toast('Você entrou na sessão.');
      await openSession(sessionId);
    });
  } finally {
    setLoading(false);
  }
}

async function openSession(sessionId) {
  setLoading(true, 'Carregando sessão...');
  try {
    const state = await fetchCurrentState(sessionId);
    renderLobby(state);

    if (state.session?.status === 'waiting') {
      const status = await fetchSessionStatus(sessionId);
      document.getElementById('wait-status-text').textContent = `Decisões recebidas: ${status.decidedCount}/${status.requiredCount}.`;
      showScreen('screen-wait');
      return;
    }

    if (state.session?.status === 'summary') {
      renderSummary(state, lastConsolidation);
      showScreen('screen-summary');
      return;
    }

    if (state.session?.status === 'active' || state.session?.status === 'decision_pending') {
      renderChapter(state);
      showScreen('screen-chapter');
      return;
    }

    showScreen('screen-lobby');
  } finally {
    setLoading(false);
  }
}

async function handleAuthChange(user) {
  updateHeader();
  if (!user) {
    showScreen('screen-landing');
    return;
  }
  await refreshDashboard();
  showScreen('screen-dashboard');
}

async function loadAdmin() {
  if (!appState.isAdmin) return;
  setLoading(true, 'Carregando admin...');
  try {
    const [storiesPayload, chaptersPayload, decisionsPayload, rulesPayload, sessionsPayload, promptsPayload] = await Promise.all([
      adminCrud('stories', 'GET', { scope: 'stories' }),
      adminCrud('story_chapters', 'GET', { scope: 'chapters' }),
      adminCrud('story_decision_points', 'GET', { scope: 'decisions' }),
      adminCrud('story_rules', 'GET', { scope: 'rules' }),
      adminCrud('game_sessions', 'GET', { scope: 'sessions' }),
      loadPromptConfigs()
    ]);

    renderAdminList(document.getElementById('admin-stories-list'), storiesPayload.items || []);
    renderAdminList(document.getElementById('admin-chapters-list'), chaptersPayload.items || [], 'title', 'chapter_goal');
    renderAdminList(document.getElementById('admin-decisions-list'), decisionsPayload.items || [], 'title', 'visibility_mode');
    renderAdminList(document.getElementById('admin-rules-list'), rulesPayload.items || [], 'rule_name', 'rule_content');
    renderAdminList(document.getElementById('admin-sessions-list'), sessionsPayload.items || [], 'title', 'status');
    renderAdminList(document.getElementById('admin-prompts-list'), promptsPayload, 'label', 'prompt_name');
  } finally {
    setLoading(false);
  }
}

function bindAdminTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(node => node.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(node => node.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`admin-tab-${tab.dataset.adminTab}`)?.classList.add('active');
    });
  });
}

function bindForms() {
  document.getElementById('character-form').addEventListener('submit', async event => {
    event.preventDefault();
    await createCharacter(appState.currentSession.id, formToJson(event.currentTarget));
    toast('Personagem salvo.');
    await openSession(appState.currentSession.id);
  });

  document.getElementById('decision-form').addEventListener('submit', async event => {
    event.preventDefault();
    const optionId = event.currentTarget.querySelector('input[name="decision_option_id"]:checked')?.value;
    if (!optionId) {
      toast('Escolha uma opção.');
      return;
    }
    await submitDecision(appState.currentSession.id, appState.currentState.decisionPoint.id, optionId, document.getElementById('decision-note').value);
    const status = await fetchSessionStatus(appState.currentSession.id);
    if (status.allDecided) {
      lastConsolidation = await consolidateRound(appState.currentSession.id);
      await openSession(appState.currentSession.id);
    } else {
      document.getElementById('wait-status-text').textContent = `Decisões recebidas: ${status.decidedCount}/${status.requiredCount}.`;
      showScreen('screen-wait');
    }
  });

  document.getElementById('admin-story-form').addEventListener('submit', async event => {
    event.preventDefault();
    await adminCrud('stories', 'POST', { data: formToJson(event.currentTarget) });
    toast('História salva.');
    await loadAdmin();
    event.currentTarget.reset();
  });

  document.getElementById('admin-chapter-form').addEventListener('submit', async event => {
    event.preventDefault();
    await adminCrud('story_chapters', 'POST', { data: formToJson(event.currentTarget) });
    toast('Capítulo salvo.');
    await loadAdmin();
    event.currentTarget.reset();
  });

  document.getElementById('admin-decision-form').addEventListener('submit', async event => {
    event.preventDefault();
    await adminCrud('story_decision_points', 'POST', { data: formToJson(event.currentTarget) });
    toast('Ponto de decisão salvo.');
    await loadAdmin();
    event.currentTarget.reset();
  });

  document.getElementById('admin-prompt-form').addEventListener('submit', async event => {
    event.preventDefault();
    await adminCrud('story_prompt_configs', 'POST', { data: formToJson(event.currentTarget) });
    toast('Prompt salvo.');
    await loadAdmin();
    event.currentTarget.reset();
  });

  document.getElementById('admin-rule-form').addEventListener('submit', async event => {
    event.preventDefault();
    await adminCrud('story_rules', 'POST', { data: formToJson(event.currentTarget) });
    toast('Regra salva.');
    await loadAdmin();
    event.currentTarget.reset();
  });
}

function bindButtons() {
  bindSimpleNavigation();
  bindAdminTabs();

  document.getElementById('btn-start-login').addEventListener('click', () => showScreen('screen-login'));
  document.getElementById('btn-open-login').addEventListener('click', () => showScreen('screen-login'));
  document.getElementById('btn-google-login').addEventListener('click', async () => signInWithGoogle());
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut();
    toast('Sessão encerrada.');
  });
  document.getElementById('btn-admin').addEventListener('click', async () => {
    await loadAdmin();
    showScreen('screen-admin');
  });
  document.getElementById('btn-open-admin').addEventListener('click', async () => {
    await loadAdmin();
    showScreen('screen-admin');
  });
  document.getElementById('btn-refresh-dashboard').addEventListener('click', refreshDashboard);
  document.getElementById('btn-refresh-session').addEventListener('click', async () => openSession(appState.currentSession.id));
  document.getElementById('btn-refresh-chapter').addEventListener('click', async () => openSession(appState.currentSession.id));
  document.getElementById('btn-refresh-wait').addEventListener('click', async () => openSession(appState.currentSession.id));
  document.getElementById('btn-open-character').addEventListener('click', () => showScreen('screen-character'));
  document.getElementById('btn-check-decisions').addEventListener('click', async () => {
    const status = await fetchSessionStatus(appState.currentSession.id);
    toast(`Decisões: ${status.decidedCount}/${status.requiredCount}`);
  });
  document.getElementById('btn-consolidate-round').addEventListener('click', async () => {
    lastConsolidation = await consolidateRound(appState.currentSession.id);
    await openSession(appState.currentSession.id);
  });
  document.getElementById('btn-open-next-chapter').addEventListener('click', async () => {
    await generateNextChapter(appState.currentSession.id);
    await openSession(appState.currentSession.id);
  });
}

async function bootstrap() {
  setLoading(true, 'Inicializando aplicativo...');
  try {
    await initPublicConfig();
    bindButtons();
    bindForms();
    await initAuth(handleAuthChange);
    await sincronizarVersaoAppNaTela();
  } catch (error) {
    toast(error.message || 'Falha ao inicializar.');
  } finally {
    setLoading(false);
  }
}

bootstrap();
