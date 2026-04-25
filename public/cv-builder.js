import { escapeHtml, formatDate } from './ui.js';

export function renderStories(container, stories, onCreate) {
  container.classList.add('story-carousel');
  container.innerHTML = stories.length === 0
    ? '<div class="stack-item">Nenhuma história publicada ainda.</div>'
    : stories.map(story => `
      <article class="story-card">
        ${story.cover_url && /^https?:\/\//.test(story.cover_url) ? `<img class="story-cover" src="${escapeHtml(story.cover_url)}" alt="">` : ''}
        <p class="eyebrow">${escapeHtml(story.system_base || story.slug || 'historia')}</p>
        <h3>${escapeHtml(story.title)}</h3>
        <p>${escapeHtml(story.summary || 'Sem resumo cadastrado.')}</p>
        <p>Jogadores: ${escapeHtml(story.min_players || 1)}-${escapeHtml(story.max_players || 4)}</p>
        <p>Ficha: ${escapeHtml(story.character_compatibility || 'generic-flex')}</p>
        <button class="btn" data-story-create="${story.id}">Escolher história</button>
      </article>
    `).join('');

  container.querySelectorAll('[data-story-create]').forEach(button => {
    button.addEventListener('click', () => onCreate(button.dataset.storyCreate));
  });
}

export function renderCharacterLibrary(state, onSelect) {
  const container = document.getElementById('character-library');
  if (!container) return;

  const items = state.compatibleCharacters || [];
  container.innerHTML = items.length === 0
    ? '<div class="stack-item">Nenhuma ficha compatível salva. Crie uma nova abaixo.</div>'
    : items.map(item => `
      <article class="stack-item">
        <h4>${escapeHtml(item.name)}</h4>
        <p>${escapeHtml(item.class_name || item.sheet_template || 'Ficha flexível')}</p>
        <p>Sistema: ${escapeHtml(item.system_name || 'generic')}</p>
        <p>FR ${item.attributes?.strength || 0} | DZ ${item.attributes?.agility || 0} | IN ${item.attributes?.intelligence || 0} | CN ${item.attributes?.charisma || 0}</p>
        <p>Compatível: ${escapeHtml(item.custom_fields?.story_type || item.sheet_template || 'generic-flex')}</p>
        <button class="btn secondary" data-character-select="${item.id}">Usar esta ficha</button>
      </article>
    `).join('');

  container.querySelectorAll('[data-character-select]').forEach(button => {
    button.addEventListener('click', () => onSelect(button.dataset.characterSelect));
  });
}

export function renderSessions(container, sessions, onOpen, onJoin) {
  container.innerHTML = sessions.length === 0
    ? '<div class="stack-item">Você ainda não participa de nenhuma sessão.</div>'
    : sessions.map(session => `
      <article class="stack-item">
        <h4>${escapeHtml(session.title || session.stories?.title || 'Sessão')}</h4>
        <p>Status: ${escapeHtml(session.status || 'lobby')}</p>
        <p>História: ${escapeHtml(session.stories?.title || '—')}</p>
        <div class="actions">
          <button class="btn secondary" data-session-open="${session.id}">Abrir</button>
          <button class="btn ghost" data-session-join="${session.id}">Entrar novamente</button>
        </div>
      </article>
    `).join('');

  container.querySelectorAll('[data-session-open]').forEach(button => {
    button.addEventListener('click', () => onOpen(button.dataset.sessionOpen));
  });
  container.querySelectorAll('[data-session-join]').forEach(button => {
    button.addEventListener('click', () => onJoin(button.dataset.sessionJoin));
  });
}

export function renderLobby(state) {
  document.getElementById('lobby-title').textContent = state.session?.title || state.story?.title || 'Sessão';
  document.getElementById('session-players').innerHTML = (state.players || []).map(player => `
    <article class="stack-item">
      <h4>${escapeHtml(player.profile?.full_name || player.email || 'Jogador')}</h4>
      <p>Pronto: ${player.character ? 'Sim' : 'Não'}</p>
      <p>Personagem: ${escapeHtml(player.character?.name || 'Ainda não criado')}</p>
    </article>
  `).join('') || '<div class="stack-item">Sem jogadores.</div>';

  document.getElementById('session-status-box').innerHTML = `
    <article class="stack-item">
      <h4>Status</h4>
      <p>${escapeHtml(state.session?.status || 'lobby')}</p>
      <p>Criada em ${formatDate(state.session?.created_at)}</p>
    </article>
    <article class="stack-item">
      <h4>Progresso</h4>
      <p>Capítulo atual: ${escapeHtml(state.chapter?.title || 'Aguardando')}</p>
      <p>Decisões recebidas: ${state.decisionStatus?.decidedCount || 0}/${state.decisionStatus?.requiredCount || 0}</p>
    </article>
  `;
}

export function renderChapter(state) {
  document.getElementById('chapter-title').textContent = state.chapter?.title || 'Capítulo atual';
  document.getElementById('chapter-narration').textContent = state.chapterState?.narration || state.chapter?.opening_text || 'Aguardando narração.';

  const globalImpact = state.chapterState?.global_impact || 'Nenhum impacto global consolidado ainda.';
  const individual = state.chapterState?.individual_impacts || {};
  document.getElementById('chapter-impacts').innerHTML = `
    <article class="impact-card">
      <strong>Impacto global</strong>
      <span>${escapeHtml(globalImpact)}</span>
    </article>
    ${(state.players || []).map(player => `
      <article class="impact-card">
        <strong>${escapeHtml(player.character?.name || player.profile?.full_name || 'Jogador')}</strong>
        <span>${escapeHtml(individual[player.character?.id] || 'Sem impacto individual consolidado ainda.')}</span>
      </article>
    `).join('')}
  `;

  document.getElementById('decision-title').textContent = state.decisionPoint?.title || 'Sem decisão pendente';
  const optionsList = state.decisionOptions || [];
  document.getElementById('decision-options').innerHTML = optionsList.length === 0
    ? '<div class="stack-item">Não há opções de decisão neste momento.</div>'
    : optionsList.map(option => `
      <label class="stack-item">
        <input type="radio" name="decision_option_id" value="${option.id}" required>
        <strong>${escapeHtml(option.option_label)}</strong>
        <span>${escapeHtml(option.option_description || '')}</span>
      </label>
    `).join('');
}

export function renderSummary(state, consolidation) {
  document.getElementById('summary-content').textContent = consolidation?.summary || state.chapterState?.resolution_summary || 'Resumo ainda não disponível.';
  const individual = consolidation?.individualImpacts || state.chapterState?.individual_impacts || {};
  document.getElementById('summary-impacts').innerHTML = `
    <article class="impact-card">
      <strong>Impacto global</strong>
      <span>${escapeHtml(consolidation?.globalImpact || state.chapterState?.global_impact || 'Sem impacto global consolidado.')}</span>
    </article>
    ${Object.entries(individual).map(([name, text]) => `
      <article class="impact-card">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(text)}</span>
      </article>
    `).join('')}
  `;
}

export function renderAdminStories(container, items, actions = {}) {
  if (!container) return;
  const selectedId = actions.selectedId || '';
  container.innerHTML = items.length === 0
    ? '<div class="stack-item">Nenhuma história encontrada.</div>'
    : items.map(item => `
      <article class="stack-item story-admin-card ${item.id === selectedId ? 'selected' : ''}" data-admin-story-select="${item.id}">
        <div class="story-admin-head">
          <div>
            <h4>${escapeHtml(item.title || item.id)}</h4>
            <p class="muted-copy">${escapeHtml(item.summary || 'Sem resumo curto.')}</p>
          </div>
          <span class="story-admin-badge ${item.is_published ? 'is-live' : 'is-draft'}">${item.is_published ? 'Publicada' : 'Rascunho'}</span>
        </div>
        <div class="story-admin-meta">
          <span>Slug: ${escapeHtml(item.slug || '—')}</span>
          <span>Sistema: ${escapeHtml(item.system_base || 'generic')}</span>
          <span>Jogadores: ${escapeHtml(item.min_players || 1)}-${escapeHtml(item.max_players || 4)}</span>
        </div>
        <p>${escapeHtml(item.lore_description || item.world_context || 'Sem história geral cadastrada ainda.')}</p>
        <div class="actions">
          <button class="btn secondary" data-admin-story-edit="${item.id}">Editar</button>
          <button class="btn ghost" data-admin-story-delete="${item.id}">Excluir</button>
        </div>
      </article>
    `).join('');

  container.querySelectorAll('[data-admin-story-edit]').forEach(button => {
    button.addEventListener('click', () => actions.onEdit?.(button.dataset.adminStoryEdit));
  });

  container.querySelectorAll('[data-admin-story-delete]').forEach(button => {
    button.addEventListener('click', () => actions.onDelete?.(button.dataset.adminStoryDelete));
  });

  container.querySelectorAll('[data-admin-story-select]').forEach(card => {
    card.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      actions.onSelect?.(card.dataset.adminStorySelect);
    });
  });
}

export function renderAdminList(container, items, titleKey = 'title', subtitleKey = 'id') {
  container.innerHTML = items.length === 0
    ? '<div class="stack-item">Nenhum item encontrado.</div>'
    : items.map(item => `
      <article class="stack-item">
        <h4>${escapeHtml(item[titleKey] || item.prompt_name || item.rule_name || item.id)}</h4>
        <p>${escapeHtml(item[subtitleKey] || item.summary || item.label || '')}</p>
      </article>
    `).join('');
}
