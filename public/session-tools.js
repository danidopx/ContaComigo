import { escapeHtml, formatDate } from './ui.js';

export function renderSessionTools({ messages = [], presets = [], rolls = [] }) {
  const chatList = document.getElementById('session-chat-list');
  const presetBar = document.getElementById('session-chat-presets');
  const rollList = document.getElementById('session-roll-list');

  if (chatList) {
    chatList.innerHTML = messages.length === 0
      ? '<div class="stack-item">Nenhuma mensagem ainda.</div>'
      : messages.slice(-20).map(item => `
        <article class="stack-item compact-item">
          <strong>${escapeHtml(item.author || 'Jogador')}</strong>
          <p>${escapeHtml(item.message || '')}</p>
          <small>${formatDate(item.created_at)}</small>
        </article>
      `).join('');
  }

  if (presetBar) {
    presetBar.innerHTML = presets.length === 0
      ? '<span class="muted-copy">Sem mensagens prontas cadastradas.</span>'
      : presets.map(item => `<button type="button" class="btn ghost" data-chat-preset="${encodeURIComponent(item)}">${escapeHtml(item)}</button>`).join('');
  }

  if (rollList) {
    rollList.innerHTML = rolls.length === 0
      ? '<div class="stack-item">Nenhuma rolagem ainda.</div>'
      : rolls.slice(-10).map(item => `
        <article class="stack-item compact-item">
          <strong>${escapeHtml(item.actor || 'Jogador')} rolou ${escapeHtml(item.dice || '')}</strong>
          <p>${escapeHtml((item.rolls || []).join(', '))} | total ${escapeHtml(item.total)}</p>
          <small>${formatDate(item.created_at)}</small>
        </article>
      `).join('');
  }
}
