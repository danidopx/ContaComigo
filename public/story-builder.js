import { escapeHtml, formatDate } from './ui.js';

const builderState = {
  stories: [],
  storyId: '',
  selectedNodeId: '',
  connectorSourceId: '',
  payload: {
    builderState: { nodes: [], edges: [] },
    settings: {},
    chatPresets: [],
    mediaMetadata: {},
    versions: []
  }
};

export function initStoryBuilder({ onLoadStory, onGenerateBase, onSaveBuilder, onPublishBuilder }) {
  const storySelect = document.getElementById('builder-story-select');
  const generateForm = document.getElementById('builder-generate-form');
  const nodeForm = document.getElementById('builder-node-form');
  const addButtons = [...document.querySelectorAll('[data-builder-add-node]')];
  const connectButton = document.getElementById('builder-connect-node');
  const removeButton = document.getElementById('builder-remove-node');
  const resetEdgesButton = document.getElementById('builder-reset-edges');
  const saveButton = document.getElementById('builder-save');
  const publishButton = document.getElementById('builder-publish');

  storySelect?.addEventListener('change', async event => {
    builderState.storyId = event.currentTarget.value;
    syncGuideFromStory(builderState.stories.find(item => item.id === builderState.storyId));
    if (builderState.storyId) await onLoadStory(builderState.storyId);
  });

  generateForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await onGenerateBase(builderState.storyId, {
      title: formData.get('title'),
      premise: formData.get('premise'),
      genre: formData.get('genre'),
      tone: formData.get('tone'),
      narrativeModel: formData.get('narrativeModel')
    }, collectBuilderMeta());
  });

  nodeForm?.addEventListener('submit', event => {
    event.preventDefault();
    applyNodeEditor();
    renderBuilderCanvas();
  });

  addButtons.forEach(button => {
    button.addEventListener('click', () => {
      appendNode(button.dataset.builderAddNode);
      renderBuilderCanvas();
    });
  });

  connectButton?.addEventListener('click', () => {
    if (!builderState.selectedNodeId) return;
    builderState.connectorSourceId = builderState.selectedNodeId;
    renderBuilderCanvas();
  });

  removeButton?.addEventListener('click', () => {
    if (!builderState.selectedNodeId) return;
    removeSelectedNode();
    renderBuilderCanvas();
  });

  resetEdgesButton?.addEventListener('click', () => {
    builderState.payload.builderState.edges = [];
    renderBuilderCanvas();
  });

  saveButton?.addEventListener('click', async () => {
    applyNodeEditor();
    await onSaveBuilder(builderState.storyId, collectBuilderMeta());
  });

  publishButton?.addEventListener('click', async () => {
    applyNodeEditor();
    await onPublishBuilder(builderState.storyId, collectBuilderMeta());
  });

  renderBuilderCanvas();
}

export function setBuilderStories(stories) {
  builderState.stories = stories || [];
  const select = document.getElementById('builder-story-select');
  if (!select) return;

  select.innerHTML = '<option value="">Selecione uma história</option>'
    + builderState.stories.map(story => `<option value="${story.id}">${escapeHtml(story.title)}</option>`).join('');

  if (!builderState.storyId && builderState.stories[0]) {
    builderState.storyId = builderState.stories[0].id;
    select.value = builderState.storyId;
    syncGuideFromStory(builderState.stories[0]);
  } else {
    select.value = builderState.storyId;
  }
}

export function loadBuilderPayload(payload) {
  builderState.payload = {
    builderState: payload.builderState || { nodes: [], edges: [] },
    settings: payload.settings || {},
    chatPresets: payload.chatPresets || [],
    mediaMetadata: payload.mediaMetadata || {},
    versions: payload.versions || []
  };
  builderState.storyId = payload.story?.id || builderState.storyId;
  builderState.selectedNodeId = builderState.payload.builderState.nodes[0]?.id || '';
  builderState.connectorSourceId = '';

  hydrateBuilderForms();
  renderBuilderCanvas();
  renderBuilderVersions();
  syncGuideFromStory(payload.story || builderState.stories.find(item => item.id === builderState.storyId));
}

export function collectBuilderMeta() {
  const settings = {
    title: document.getElementById('builder-title')?.value || '',
    premise: document.getElementById('builder-premise')?.value || '',
    genre: document.getElementById('builder-genre')?.value || '',
    tone: document.getElementById('builder-tone')?.value || '',
    narrativeModel: document.getElementById('builder-model')?.value || ''
  };
  const chatPresets = splitLines(document.getElementById('builder-chat-presets')?.value || '');
  const mediaMetadata = {
    image: document.getElementById('builder-media-image')?.value || '',
    music: document.getElementById('builder-media-music')?.value || ''
  };

  builderState.payload.settings = settings;
  builderState.payload.chatPresets = chatPresets;
  builderState.payload.mediaMetadata = mediaMetadata;

  return {
    builderState: builderState.payload.builderState,
    settings,
    chatPresets,
    mediaMetadata
  };
}

function hydrateBuilderForms() {
  const currentStory = builderState.stories.find(item => item.id === builderState.storyId);
  document.getElementById('builder-title').value = builderState.payload.settings.title || currentStory?.title || '';
  document.getElementById('builder-premise').value = builderState.payload.settings.premise || currentStory?.lore_description || currentStory?.summary || '';
  document.getElementById('builder-genre').value = builderState.payload.settings.genre || '';
  document.getElementById('builder-tone').value = builderState.payload.settings.tone || currentStory?.tone_style || '';
  document.getElementById('builder-model').value = builderState.payload.settings.narrativeModel || '';
  document.getElementById('builder-chat-presets').value = (builderState.payload.chatPresets || []).join('\n');
  document.getElementById('builder-media-image').value = builderState.payload.mediaMetadata.image || '';
  document.getElementById('builder-media-music').value = builderState.payload.mediaMetadata.music || '';
  hydrateNodeEditor();
}

function syncGuideFromStory(story) {
  if (!story) return;
  const titleInput = document.getElementById('builder-title');
  const premiseInput = document.getElementById('builder-premise');
  const toneInput = document.getElementById('builder-tone');
  if (titleInput && !titleInput.value) titleInput.value = story.title || '';
  if (premiseInput && !premiseInput.value) premiseInput.value = story.lore_description || story.summary || '';
  if (toneInput && !toneInput.value) toneInput.value = story.tone_style || '';
}

function renderBuilderCanvas() {
  const surface = document.getElementById('builder-canvas');
  if (!surface) return;
  const state = builderState.payload.builderState || { nodes: [], edges: [] };
  const nodes = state.nodes || [];
  const edges = state.edges || [];

  const maxX = Math.max(1200, ...nodes.map(node => node.position?.x || 0)) + 360;
  const maxY = Math.max(500, ...nodes.map(node => node.position?.y || 0)) + 220;

  surface.innerHTML = `
    <svg class="builder-edges" viewBox="0 0 ${maxX} ${maxY}" preserveAspectRatio="none">
      ${edges.map(edge => {
        const source = nodes.find(node => node.id === edge.source);
        const target = nodes.find(node => node.id === edge.target);
        if (!source || !target) return '';
        const x1 = (source.position?.x || 0) + 110;
        const y1 = (source.position?.y || 0) + 56;
        const x2 = target.position?.x || 0;
        const y2 = (target.position?.y || 0) + 56;
        const midX = (x1 + x2) / 2;
        return `<path d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" />`;
      }).join('')}
    </svg>
    ${nodes.map(node => {
      const laneClass = laneClassByType(node.type);
      const selected = node.id === builderState.selectedNodeId ? ' selected' : '';
      const connecting = node.id === builderState.connectorSourceId ? ' connecting' : '';
      return `
        <article class="builder-node ${laneClass}${selected}${connecting}" data-builder-node="${node.id}" style="left:${node.position?.x || 0}px;top:${node.position?.y || 0}px;">
          <header class="builder-node-head">
            <span>${escapeHtml(node.type.replace('_', ' '))}</span>
            <button type="button" class="builder-link-btn" data-builder-node-action="select" data-builder-node-id="${node.id}">Editar</button>
          </header>
          <strong>${escapeHtml(node.data?.title || 'Bloco')}</strong>
          <p>${escapeHtml(node.data?.text || 'Sem descrição.')}</p>
        </article>
      `;
    }).join('')}
  `;

  surface.style.minWidth = `${maxX}px`;
  surface.style.minHeight = `${maxY}px`;

  surface.querySelectorAll('[data-builder-node]').forEach(node => {
    node.addEventListener('click', event => {
      if (event.target.closest('[data-builder-node-action="select"]')) return;
      handleNodeClick(node.dataset.builderNode);
    });
    makeNodeDraggable(node);
  });

  surface.querySelectorAll('[data-builder-node-action="select"]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      handleNodeClick(button.dataset.builderNodeId);
    });
  });

  hydrateNodeEditor();
  renderBuilderSummary();
}

function renderBuilderSummary() {
  const runtime = estimateRuntime();
  const container = document.getElementById('builder-runtime-summary');
  if (!container) return;
  container.innerHTML = `
    <article class="stack-item">
      <h4>Blocos</h4>
      <p>${runtime.chapterCount} capitulos / ${runtime.decisionCount} decisoes</p>
    </article>
    <article class="stack-item">
      <h4>Fluxo</h4>
      <p>${escapeHtml(runtime.sequence || 'Monte um fluxo inicial no canvas.')}</p>
    </article>
  `;
}

function renderBuilderVersions() {
  const container = document.getElementById('builder-versions-list');
  if (!container) return;
  const versions = builderState.payload.versions || [];
  container.innerHTML = versions.length === 0
    ? '<div class="stack-item">Nenhuma versão salva ainda.</div>'
    : versions.map(item => `
      <article class="stack-item">
        <h4>v${escapeHtml(item.version_number)}</h4>
        <p>${escapeHtml(item.version_status)} | ${formatDate(item.created_at)}</p>
        <p>${escapeHtml(item.notes || 'Sem nota')}</p>
      </article>
    `).join('');
}

function handleNodeClick(nodeId) {
  if (builderState.connectorSourceId && builderState.connectorSourceId !== nodeId) {
    const exists = builderState.payload.builderState.edges.some(edge => edge.source === builderState.connectorSourceId && edge.target === nodeId);
    if (!exists) {
      builderState.payload.builderState.edges.push({
        id: `edge-${Date.now()}`,
        source: builderState.connectorSourceId,
        target: nodeId,
        label: '',
        kind: 'flow'
      });
    }
    builderState.connectorSourceId = '';
  }

  builderState.selectedNodeId = nodeId;
  renderBuilderCanvas();
}

function hydrateNodeEditor() {
  const node = builderState.payload.builderState.nodes.find(item => item.id === builderState.selectedNodeId);
  const form = document.getElementById('builder-node-form');
  const empty = !node;
  form?.classList.toggle('muted-panel', empty);

  document.getElementById('builder-node-title').value = node?.data?.title || '';
  document.getElementById('builder-node-text').value = node?.data?.text || '';
  document.getElementById('builder-node-goal').value = node?.data?.goal || '';
  document.getElementById('builder-node-image').value = node?.data?.image || '';
  document.getElementById('builder-node-music').value = node?.data?.music || '';
  document.getElementById('builder-node-options').value = (node?.data?.options || [])
    .map(option => [option.label, option.text, option.targetNodeId].filter(Boolean).join('|'))
    .join('\n');
}

function applyNodeEditor() {
  const node = builderState.payload.builderState.nodes.find(item => item.id === builderState.selectedNodeId);
  if (!node) return;
  node.data.title = document.getElementById('builder-node-title').value || '';
  node.data.text = document.getElementById('builder-node-text').value || '';
  node.data.goal = document.getElementById('builder-node-goal').value || '';
  node.data.image = document.getElementById('builder-node-image').value || '';
  node.data.music = document.getElementById('builder-node-music').value || '';
  node.data.options = splitLines(document.getElementById('builder-node-options').value || '').map((line, index) => {
    const [label, text, targetNodeId] = line.split('|').map(item => item.trim());
    return {
      id: `${node.id}-opt-${index + 1}`,
      label: label || `Opcao ${index + 1}`,
      text: text || '',
      targetNodeId: targetNodeId || ''
    };
  });
}

function appendNode(type) {
  const nodes = builderState.payload.builderState.nodes;
  const index = nodes.length;
  const node = {
    id: `${type}-${Date.now()}`,
    type,
    position: { x: 100 + index * 220, y: 120 + (index % 3) * 140 },
    data: {
      title: labelByType(type),
      text: '',
      goal: '',
      image: '',
      music: '',
      options: type.includes('decisao')
        ? [
            { id: `${type}-${Date.now()}-a`, label: 'Opcao 1', text: '', targetNodeId: '' },
            { id: `${type}-${Date.now()}-b`, label: 'Opcao 2', text: '', targetNodeId: '' }
          ]
        : []
    }
  };
  nodes.push(node);
  if (nodes.length > 1) {
    const previous = nodes[nodes.length - 2];
    builderState.payload.builderState.edges.push({
      id: `edge-${Date.now()}-${index}`,
      source: previous.id,
      target: node.id,
      label: '',
      kind: 'flow'
    });
  }
  builderState.selectedNodeId = node.id;
}

function removeSelectedNode() {
  builderState.payload.builderState.nodes = builderState.payload.builderState.nodes.filter(node => node.id !== builderState.selectedNodeId);
  builderState.payload.builderState.edges = builderState.payload.builderState.edges.filter(edge => edge.source !== builderState.selectedNodeId && edge.target !== builderState.selectedNodeId);
  builderState.selectedNodeId = builderState.payload.builderState.nodes[0]?.id || '';
  builderState.connectorSourceId = '';
}

function estimateRuntime() {
  const nodes = builderState.payload.builderState.nodes || [];
  const sequence = nodes.map(node => node.data?.title || node.type).join(' -> ');
  return {
    chapterCount: nodes.filter(node => !node.type.includes('decisao')).length,
    decisionCount: nodes.filter(node => node.type.includes('decisao')).length,
    sequence
  };
}

function makeNodeDraggable(nodeElement) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;
  const nodeId = nodeElement.dataset.builderNode;

  nodeElement.onpointerdown = event => {
    if (event.target.closest('button')) return;
    dragging = true;
    builderState.selectedNodeId = nodeId;
    offsetX = event.clientX - nodeElement.offsetLeft;
    offsetY = event.clientY - nodeElement.offsetTop;
    nodeElement.setPointerCapture(event.pointerId);
  };

  nodeElement.onpointermove = event => {
    if (!dragging) return;
    const node = builderState.payload.builderState.nodes.find(item => item.id === nodeId);
    if (!node) return;
    node.position.x = Math.max(24, event.clientX - offsetX);
    node.position.y = Math.max(24, event.clientY - offsetY);
    nodeElement.style.left = `${node.position.x}px`;
    nodeElement.style.top = `${node.position.y}px`;
  };

  nodeElement.onpointerup = event => {
    dragging = false;
    nodeElement.releasePointerCapture?.(event.pointerId);
    renderBuilderCanvas();
  };
}

function splitLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function labelByType(type) {
  return {
    start: 'Inicio',
    ato: 'Ato',
    evento: 'Evento',
    decisao_grupo: 'Decisao em grupo',
    decisao_pessoal: 'Decisao pessoal',
    surpresa: 'Surpresa',
    boss: 'Boss',
    final: 'Final'
  }[type] || 'Bloco';
}

function laneClassByType(type) {
  if (type === 'start') return ' lane-start';
  if (type === 'final' || type === 'boss') return ' lane-end';
  if (type === 'decisao_grupo') return ' lane-group';
  if (type === 'decisao_pessoal') return ' lane-personal';
  return ' lane-middle';
}
