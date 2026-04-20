import { escapeHtml, formatDate } from './ui.js';

export function renderStories(container, stories, onCreate) {
  container.innerHTML = stories.length === 0
    ? '<div class="stack-item">Nenhuma história publicada ainda.</div>'
    : stories.map(story => `
      <article class="story-card">
        <p class="eyebrow">${escapeHtml(story.slug || 'historia')}</p>
        <h3>${escapeHtml(story.title)}</h3>
        <p>${escapeHtml(story.summary || 'Sem resumo cadastrado.')}</p>
        <button class="btn" data-story-create="${story.id}">Criar sessão</button>
      </article>
    `).join('');

  container.querySelectorAll('[data-story-create]').forEach(button => {
    button.addEventListener('click', () => onCreate(button.dataset.storyCreate));
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
