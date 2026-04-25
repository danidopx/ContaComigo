import { appState, initPublicConfig } from './config.js';
import { initAuth, signInWithGoogle, signOut } from './auth.js';
import {
  loadStories,
  loadMySessions,
  createSession,
  joinSession,
  createCharacter,
  submitDecision,
  fetchSessionStatus,
  consolidateRound,
  generateNextChapter,
  fetchCurrentState,
  adminCrud,
  loadPromptConfigs,
  sincronizarVersaoAppNaTela,
  loadStoryBuilder,
  saveStoryBuilder,
  generateStoryBuilder,
  publishStoryBuilder,
  loadSessionChat,
  sendSessionChat,
  loadSessionRolls,
  sendSessionRoll
} from './api.js';
import { bindSimpleNavigation, formToJson, setLoading, showScreen, toast } from './ui.js';
import { renderAdminList, renderAdminStories, renderChapter, renderCharacterLibrary, renderLobby, renderSessions, renderStories, renderSummary } from './cv-builder.js';
import { initStoryBuilder, loadBuilderPayload, selectBuilderStory, setBuilderStories } from './story-builder.js';
import { renderSessionTools } from './session-tools.js';

let lastConsolidation = null;
let appReady = false;
let sessionFeedTimer = null;
let landingCarouselTimer = null;
let adminStoriesCache = [];
let selectedAdminStoryId = '';

function updateLoginStatus(message = '', tone = '') {
  const node = document.getElementById('login-status');
  if (!node) return;
  node.textContent = message;
  node.className = `login-status${message ? ` ${tone}` : ''}`;
}

function updateAuthScreens() {
  const loginButtons = [
    document.getElementById('btn-start-login'),
    document.getElementById('btn-open-login'),
    document.getElementById('screen-login')
  ];
  loginButtons.forEach(node => {
    if (!node) return;
    node.classList.toggle('hidden', Boolean(appState.user));
  });
}

function updateLandingActions() {
  const openDashboard = document.getElementById('btn-open-dashboard');
  const landingAdmin = document.getElementById('btn-landing-admin');

  if (openDashboard) {
    openDashboard.classList.toggle('hidden', !appState.user);
  }

  if (landingAdmin) {
    landingAdmin.classList.toggle('hidden', !(appState.user && appState.isAdmin));
  }

  ['btn-nav-master', 'btn-nav-characters', 'btn-nav-messages'].forEach(id => {
    document.getElementById(id)?.classList.toggle('hidden', !appState.user);
  });
}

function updateHeader() {
  const chip = document.getElementById('user-chip');
  const logout = document.getElementById('btn-logout');
  const admin = document.getElementById('btn-admin');
  const openAdmin = document.getElementById('btn-open-admin');
  const home = document.getElementById('btn-home');

  if (appState.user) {
    chip.textContent = appState.user.user_metadata?.full_name || appState.user.email;
    chip.classList.remove('hidden');
    logout.classList.remove('hidden');
    home.classList.remove('hidden');
  } else {
    chip.classList.add('hidden');
    logout.classList.add('hidden');
    home.classList.add('hidden');
  }

  const adminVisible = Boolean(appState.user && appState.isAdmin);
  admin.classList.toggle('hidden', !adminVisible);
  openAdmin.classList.toggle('hidden', !adminVisible);
  updateAuthScreens();
  updateLandingActions();
}

function activateAdminTab(tabName) {
  document.querySelectorAll('.tab').forEach(node => node.classList.toggle('active', node.dataset.adminTab === tabName));
  document.querySelectorAll('.admin-panel').forEach(node => node.classList.toggle('active', node.id === `admin-tab-${tabName}`));
}

function ensureAutocompleteAttributes() {
  document.querySelectorAll('input, textarea, select').forEach(node => {
    if (!node.hasAttribute('autocomplete')) node.setAttribute('autocomplete', 'off');
  });
}

async function refreshDashboard() {
  setLoading(true, 'Atualizando dashboard...');
  try {
    const [stories, sessions] = await Promise.all([loadStories(), loadMySessions()]);
    renderStories(document.getElementById('landing-stories-list'), stories, async storyId => {
      if (!appState.user) {
        toast('Entre com Google para começar a jogar.');
        showScreen('screen-login');
        return;
      }
      const created = await createSession(storyId);
      toast('Sessão criada.');
      await openSession(created.session.id);
    });
    initLandingCarousel();
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
    renderCharacterLibrary(state, async characterId => {
      await createCharacter(appState.currentSession.id, { existingCharacterId: characterId });
      toast('Ficha vinculada à sessão.');
      await openSession(appState.currentSession.id);
    });

    const currentPlayer = state.players?.find(player => player.user_id === appState.user?.id);
    if (currentPlayer && !currentPlayer.character) {
      toast('Selecione ou crie um personagem para esta história.');
      showScreen('screen-character');
      return;
    }

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
      await refreshSessionTools(sessionId);
      showScreen('screen-chapter');
      startSessionFeedPolling(sessionId);
      return;
    }

    await refreshSessionTools(sessionId);
    startSessionFeedPolling(sessionId);
    showScreen('screen-lobby');
  } finally {
    setLoading(false);
  }
}

function initLandingCarousel() {
  const carousel = document.getElementById('landing-stories-list');
  if (!carousel) return;
  clearInterval(landingCarouselTimer);
  if (carousel.scrollWidth <= carousel.clientWidth) return;

  let paused = false;
  carousel.addEventListener('mouseenter', () => { paused = true; }, { once: true });
  carousel.addEventListener('mouseleave', () => {
    paused = false;
    initLandingCarousel();
  }, { once: true });

  landingCarouselTimer = setInterval(() => {
    if (paused) return;
    const nextLeft = carousel.scrollLeft + 320;
    carousel.scrollTo({
      left: nextLeft >= carousel.scrollWidth - carousel.clientWidth ? 0 : nextLeft,
      behavior: 'smooth'
    });
  }, 4500);
}

async function handleAuthChange(user) {
  updateHeader();
  if (!user) {
    stopSessionFeedPolling();
    updateLoginStatus(appReady ? 'Login Google pronto.' : '', appReady ? 'success' : '');
    showScreen('screen-landing');
    return;
  }
  updateLoginStatus('', '');
  await refreshDashboard();
  showScreen('screen-landing');
}

async function loadAdmin() {
  if (!appState.isAdmin) return;
  setLoading(true, 'Carregando admin...');
  try {
    const [storiesPayload, chaptersPayload, decisionsPayload, decisionOptionsPayload, rulesPayload, sessionsPayload, usersPayload, promptsPayload] = await Promise.all([
      adminCrud('stories', 'GET', { scope: 'stories' }),
      adminCrud('story_chapters', 'GET', { scope: 'chapters' }),
      adminCrud('story_decision_points', 'GET', { scope: 'decisions' }),
      adminCrud('story_decision_options', 'GET', { scope: 'decisionOptions' }),
      adminCrud('story_rules', 'GET', { scope: 'rules' }),
      adminCrud('game_sessions', 'GET', { scope: 'sessions' }),
      adminCrud('auth_users', 'GET', { scope: 'users' }),
      loadPromptConfigs()
    ]);

    adminStoriesCache = storiesPayload.items || [];
    renderAdminStories(document.getElementById('admin-stories-list'), adminStoriesCache, {
      selectedId: selectedAdminStoryId,
      onSelect: storyId => {
        selectedAdminStoryId = storyId;
        selectBuilderStory(storyId);
        loadStoryBuilder(storyId).then(loadBuilderPayload).catch(() => null);
        loadAdmin();
      },
      onEdit: storyId => {
        selectedAdminStoryId = storyId;
        populateStoryForm(adminStoriesCache.find(item => item.id === storyId));
        activateAdminTab('stories');
      },
      onDelete: async storyId => {
        const story = adminStoriesCache.find(item => item.id === storyId);
        const confirmed = window.confirm(`Excluir a história "${story?.title || 'sem título'}"?`);
        if (!confirmed) return;
        await adminCrud('stories', 'DELETE', { id: storyId });
        toast('História excluída.');
        resetStoryForm();
        await loadAdmin();
      }
    });
    renderAdminStories(document.getElementById('builder-stories-list'), adminStoriesCache, {
      selectedId: selectedAdminStoryId,
      onSelect: storyId => {
        selectedAdminStoryId = storyId;
        selectBuilderStory(storyId);
        loadStoryBuilder(storyId).then(loadBuilderPayload).catch(error => toast(error.message || 'Falha ao carregar builder.'));
        loadAdmin();
      },
      onEdit: storyId => {
        selectedAdminStoryId = storyId;
        populateStoryForm(adminStoriesCache.find(item => item.id === storyId));
        activateAdminTab('stories');
      },
      onDelete: async storyId => {
        const story = adminStoriesCache.find(item => item.id === storyId);
        const confirmed = window.confirm(`Excluir a história "${story?.title || 'sem título'}"?`);
        if (!confirmed) return;
        await adminCrud('stories', 'DELETE', { id: storyId });
        selectedAdminStoryId = selectedAdminStoryId === storyId ? '' : selectedAdminStoryId;
        toast('História excluída.');
        resetStoryForm();
        await loadAdmin();
      }
    });
    renderAdminList(document.getElementById('admin-chapters-list'), chaptersPayload.items || [], 'title', 'chapter_goal');
    renderAdminList(document.getElementById('admin-decisions-list'), decisionsPayload.items || [], 'title', 'visibility_mode');
    renderAdminList(document.getElementById('admin-decision-options-list'), decisionOptionsPayload.items || [], 'option_label', 'option_description');
    renderAdminList(document.getElementById('admin-rules-list'), rulesPayload.items || [], 'rule_name', 'rule_content');
    renderAdminList(document.getElementById('admin-sessions-list'), sessionsPayload.items || [], 'title', 'status');
    renderAdminList(document.getElementById('admin-prompts-list'), promptsPayload, 'label', 'prompt_name');
    renderAdminUsers(document.getElementById('admin-users-list'), usersPayload.items || []);
    setBuilderStories(storiesPayload.items || []);
    const selectedStoryId = document.getElementById('builder-story-select')?.value;
    if (selectedStoryId) {
      try {
        const builderPayload = await loadStoryBuilder(selectedStoryId);
        loadBuilderPayload(builderPayload);
      } catch (error) {
        console.warn('Builder indisponível no momento:', error);
        toast('Admin carregado, mas o builder precisa da migration nova no Supabase.');
      }
    }
    return true;
  } catch (error) {
    console.error('Falha ao carregar admin:', error);
    toast(error.message || 'Falha ao carregar admin.');
    return false;
  } finally {
    setLoading(false);
  }
}

function renderAdminUsers(container, users = []) {
  if (!container) return;
  container.innerHTML = users.length
    ? users.map(user => {
      const blocked = Boolean(user.banned_until && new Date(user.banned_until) > new Date());
      return `
        <article class="stack-item">
          <div class="story-admin-head">
            <div>
              <h4>${escapeHtml(user.name || user.email || user.id)}</h4>
              <p class="muted-copy">${escapeHtml(user.email || 'Sem e-mail')}</p>
            </div>
            <span class="story-admin-badge ${blocked ? 'is-draft' : 'is-live'}">${blocked ? 'Bloqueado' : 'Ativo'}</span>
          </div>
          <div class="story-admin-meta">
            <span>Criado: ${formatDate(user.created_at)}</span>
            <span>Último login: ${formatDate(user.last_sign_in_at)}</span>
          </div>
          <div class="actions">
            <button class="btn secondary" data-admin-user-toggle="${user.id}" data-blocked="${blocked ? 'true' : 'false'}">${blocked ? 'Desbloquear' : 'Bloquear'}</button>
            <button class="btn ghost" data-admin-user-delete="${user.id}">Deletar</button>
          </div>
        </article>
      `;
    }).join('')
    : '<div class="stack-item">Nenhum usuário encontrado.</div>';

  container.querySelectorAll('[data-admin-user-toggle]').forEach(button => {
    button.addEventListener('click', async () => {
      const blocked = button.dataset.blocked === 'true';
      await adminCrud('auth_users', 'PATCH', { id: button.dataset.adminUserToggle, data: { blocked: !blocked } });
      toast(blocked ? 'Usuário desbloqueado.' : 'Usuário bloqueado.');
      await loadAdmin();
    });
  });

  container.querySelectorAll('[data-admin-user-delete]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Deletar este usuário?')) return;
      await adminCrud('auth_users', 'DELETE', { id: button.dataset.adminUserDelete });
      toast('Usuário deletado.');
      await loadAdmin();
    });
  });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : 'Nunca';
}

function populateStoryForm(story) {
  if (!story) return;
  const form = document.getElementById('admin-story-form');
  form.querySelector('[name="id"]').value = story.id || '';
  form.querySelector('[name="title"]').value = story.title || '';
  form.querySelector('[name="slug"]').value = story.slug || '';
  form.querySelector('[name="summary"]').value = story.summary || '';
  form.querySelector('[name="lore_description"]').value = story.lore_description || '';
  form.querySelector('[name="cover_url"]').value = story.cover_url || '';
  form.querySelector('[name="cover_text"]').value = story.cover_text || '';
  form.querySelector('[name="status"]').value = story.status || 'draft';
  form.querySelector('[name="system_base"]').value = story.system_base || 'generic';
  form.querySelector('[name="min_players"]').value = story.min_players || 1;
  form.querySelector('[name="max_players"]').value = story.max_players || 4;
  form.querySelector('[name="character_compatibility"]').value = story.character_compatibility || 'generic-flex';
  form.querySelector('[name="tags"]').value = Array.isArray(story.tags) ? story.tags.join(', ') : '';
  form.querySelector('[name="master_prompt"]').value = story.master_prompt || '';
  form.querySelector('[name="world_context"]').value = story.world_context || '';
  form.querySelector('[name="narrative_rules"]').value = story.narrative_rules || '';
  form.querySelector('[name="tone_style"]').value = story.tone_style || '';
  form.querySelector('[name="is_published"]').checked = Boolean(story.is_published);
  document.getElementById('admin-story-submit').textContent = 'Atualizar história';
  activateAdminTab('stories');
}

function resetStoryForm({ activate = true } = {}) {
  const form = document.getElementById('admin-story-form');
  form.reset();
  form.querySelector('[name="id"]').value = '';
  form.querySelector('[name="status"]').value = 'published';
  form.querySelector('[name="system_base"]').value = 'generic';
  form.querySelector('[name="min_players"]').value = 1;
  form.querySelector('[name="max_players"]').value = 4;
  form.querySelector('[name="character_compatibility"]').value = 'generic-flex';
  form.querySelector('[name="is_published"]').checked = true;
  document.getElementById('admin-story-submit').textContent = 'Salvar história';
  selectedAdminStoryId = '';
  selectBuilderStory('');
  if (activate) activateAdminTab('stories');
}

async function refreshSessionTools(sessionId) {
  if (!sessionId) return;
  const [chatPayload, rollPayload] = await Promise.all([
    loadSessionChat(sessionId).catch(() => ({ items: [], presets: [] })),
    loadSessionRolls(sessionId).catch(() => ({ items: [] }))
  ]);
  renderSessionTools({
    messages: chatPayload.items || [],
    presets: chatPayload.presets || [],
    rolls: rollPayload.items || []
  });

  document.querySelectorAll('[data-chat-preset]').forEach(button => {
    button.addEventListener('click', () => {
      const message = decodeURIComponent(button.dataset.chatPreset).replaceAll('@jogador', getCurrentPlayerName());
      document.getElementById('session-chat-input').value = message;
    });
  });
}

function getCurrentPlayerName() {
  const currentPlayer = appState.currentState?.players?.find(player => player.user_id === appState.user?.id);
  return currentPlayer?.profile?.full_name
    || appState.user?.user_metadata?.full_name
    || appState.user?.email
    || 'jogador';
}

function startSessionFeedPolling(sessionId) {
  stopSessionFeedPolling();
  sessionFeedTimer = setInterval(() => {
    if (!appState.currentSession?.id || appState.currentSession.id !== sessionId) return;
    refreshSessionTools(sessionId).catch(() => null);
  }, 8000);
}

function stopSessionFeedPolling() {
  if (!sessionFeedTimer) return;
  clearInterval(sessionFeedTimer);
  sessionFeedTimer = null;
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
    const raw = formToJson(event.currentTarget);
    const id = raw.id;
    delete raw.id;
    if (id) {
      await adminCrud('stories', 'PATCH', { id, data: raw });
      toast('História atualizada.');
    } else {
      await adminCrud('stories', 'POST', { data: raw });
      toast('História criada.');
    }
    await loadAdmin();
    resetStoryForm();
  });

  document.getElementById('admin-story-reset').addEventListener('click', () => {
    resetStoryForm();
  });

  document.getElementById('admin-story-edit-selected')?.addEventListener('click', () => {
    const story = adminStoriesCache.find(item => item.id === selectedAdminStoryId);
    if (!story) {
      toast('Selecione uma história na lista para editar.');
      return;
    }
    populateStoryForm(story);
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

  document.getElementById('admin-decision-option-form').addEventListener('submit', async event => {
    event.preventDefault();
    await adminCrud('story_decision_options', 'POST', { data: formToJson(event.currentTarget) });
    toast('Opção de decisão salva.');
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

  document.getElementById('session-chat-form').addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('session-chat-input');
    const message = input.value.trim();
    if (!message || !appState.currentSession?.id) return;
    await sendSessionChat(appState.currentSession.id, message);
    input.value = '';
    await refreshSessionTools(appState.currentSession.id);
  });

  initStoryBuilder({
    onLoadStory: async storyId => {
      if (!storyId) return;
      selectedAdminStoryId = storyId;
      setLoading(true, 'Carregando builder...');
      try {
        const payload = await loadStoryBuilder(storyId);
        loadBuilderPayload(payload);
      } finally {
        setLoading(false);
      }
    },
    onGenerateBase: async (storyId, input, meta) => {
      if (!storyId) {
        toast('Escolha uma história antes de gerar.');
        return;
      }
      setLoading(true, 'Gerando base...');
      try {
        const payload = await generateStoryBuilder(storyId, input, meta);
        const refreshedPayload = await loadStoryBuilder(storyId);
        loadBuilderPayload(refreshedPayload);
        toast(payload.warning || 'Base gerada.');
      } finally {
        setLoading(false);
      }
    },
    onSaveBuilder: async (storyId, meta) => {
      if (!storyId) {
        toast('Escolha uma história antes de salvar.');
        return;
      }
      setLoading(true, 'Salvando builder...');
      try {
        await saveStoryBuilder(storyId, meta);
        const payload = await loadStoryBuilder(storyId);
        loadBuilderPayload(payload);
        toast('Builder salvo.');
      } finally {
        setLoading(false);
      }
    },
    onPublishBuilder: async (storyId, meta) => {
      if (!storyId) {
        toast('Escolha uma história antes de publicar.');
        return;
      }
      setLoading(true, 'Publicando builder...');
      try {
        await publishStoryBuilder(storyId, meta);
        const payload = await loadStoryBuilder(storyId);
        loadBuilderPayload(payload);
        await loadAdmin();
        toast('Versão publicada.');
      } finally {
        setLoading(false);
      }
    }
  });
}

function bindButtons() {
  bindSimpleNavigation();
  bindAdminTabs();

  document.getElementById('btn-start-login').addEventListener('click', () => showScreen('screen-login'));
  document.getElementById('builder-new-story')?.addEventListener('click', () => {
    resetStoryForm();
    activateAdminTab('stories');
    document.getElementById('admin-story-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('btn-open-login').addEventListener('click', () => showScreen('screen-login'));
  document.getElementById('btn-home').addEventListener('click', () => showScreen('screen-landing'));
  document.getElementById('btn-nav-play')?.addEventListener('click', () => {
    document.getElementById('landing-stories-list')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.getElementById('btn-nav-master')?.addEventListener('click', () => showScreen('screen-master'));
  document.getElementById('btn-master-builder')?.addEventListener('click', async () => {
    showScreen('screen-admin');
    activateAdminTab('builder');
    await loadAdmin();
  });
  document.getElementById('btn-master-manual')?.addEventListener('click', async () => {
    showScreen('screen-admin');
    activateAdminTab('stories');
    await loadAdmin();
  });
  document.getElementById('btn-nav-characters')?.addEventListener('click', () => showScreen('screen-character'));
  document.getElementById('btn-nav-messages')?.addEventListener('click', () => {
    if (appState.currentSession?.id) showScreen('screen-chapter');
    else showScreen('screen-dashboard');
  });
  document.getElementById('btn-nav-account')?.addEventListener('click', () => showScreen(appState.user ? 'screen-dashboard' : 'screen-login'));
  document.getElementById('btn-open-dashboard').addEventListener('click', () => showScreen('screen-dashboard'));
  document.getElementById('btn-landing-admin').addEventListener('click', async () => {
    showScreen('screen-admin');
    await loadAdmin();
  });
  document.getElementById('btn-google-login').addEventListener('click', async () => {
    if (!appReady) {
      updateLoginStatus('A configuração do login ainda não carregou. Verifique SUPABASE_URL e SUPABASE_ANON_KEY no Render.', 'error');
      toast('Login indisponível no momento.');
      return;
    }

    try {
      updateLoginStatus('Redirecionando para o Google...', 'info');
      await signInWithGoogle();
    } catch (error) {
      updateLoginStatus(error.message || 'Não foi possível iniciar o login Google.', 'error');
      toast(error.message || 'Falha ao iniciar login Google.');
    }
  });
  document.getElementById('btn-logout').addEventListener('click', async () => {
    stopSessionFeedPolling();
    await signOut();
    toast('Sessão encerrada.');
  });
  document.getElementById('btn-admin').addEventListener('click', async () => {
    showScreen('screen-admin');
    await loadAdmin();
  });
  document.getElementById('btn-open-admin').addEventListener('click', async () => {
    showScreen('screen-admin');
    await loadAdmin();
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

  document.querySelectorAll('[data-roll-dice]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!appState.currentSession?.id) return;
      await sendSessionRoll(appState.currentSession.id, button.dataset.rollDice);
      await refreshSessionTools(appState.currentSession.id);
    });
  });
}

async function bootstrap() {
  setLoading(true, 'Inicializando aplicativo...');
  try {
    await clearLegacyFrontendCache();
    bindButtons();
    bindForms();
    resetStoryForm({ activate: false });
    ensureAutocompleteAttributes();
    await initPublicConfig();
    appReady = true;
    updateLoginStatus('Login Google pronto.', 'success');
    await initAuth(handleAuthChange);
    await sincronizarVersaoAppNaTela();
  } catch (error) {
    appReady = false;
    updateLoginStatus(error.message || 'Falha ao carregar a configuração do login.', 'error');
    toast(error.message || 'Falha ao inicializar.');
  } finally {
    setLoading(false);
  }
}

bootstrap();

async function clearLegacyFrontendCache() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(registrations.map(registration => registration.unregister().catch(() => false)));
  }

  if ('caches' in window) {
    const cacheKeys = await window.caches.keys().catch(() => []);
    await Promise.all(cacheKeys
      .filter(key => key.startsWith('contacomigo-'))
      .map(key => window.caches.delete(key).catch(() => false)));
  }
}
