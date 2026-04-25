import { escapeHtml, formatDate } from './ui.js';

const STEP_IDS = ['guided', 'review', 'structure', 'decisions', 'final'];
const STEP_TITLES = ['Passo 1', 'Passo 2', 'Passo 3', 'Passo 4', 'Passo 5'];
const NODE_TYPES = ['start', 'ato', 'evento', 'decisao_grupo', 'decisao_pessoal', 'surpresa', 'boss', 'final'];
const GUIDED_TEMPLATE = `Título provisório:
Gênero:
Tom:
Ambientação:
Tema central:
Tipo de jornada:
Quantidade de jogadores:
Faixa de duração:
Resumo da premissa:
Como a história começa:
Possíveis conflitos:
Tipo de antagonista:
Possíveis reviravoltas:
Como imagina o final:
Referências opcionais:
Restrições e observações:`;

const builderState = {
  stories: [],
  storyId: '',
  currentStep: 1,
  selectedNodeId: '',
  payload: {
    story: null,
    storyForm: {},
    guidedDescription: GUIDED_TEMPLATE,
    builderState: { nodes: [], edges: [] },
    settings: {},
    chatPresets: [],
    mediaMetadata: {},
    versions: []
  }
};

export function initStoryBuilder({ onLoadStory, onGenerateBase, onSaveBuilder, onPublishBuilder }) {
  bindCoreActions({ onLoadStory, onGenerateBase, onSaveBuilder, onPublishBuilder });
  renderStepNavigation();
  renderBuilderCanvas();
  renderStructureList();
  renderDecisionList();
  renderFinalSummary();
}

export function setBuilderStories(stories) {
  builderState.stories = stories || [];
  const select = document.getElementById('builder-story-select');
  if (!select) return;

  select.innerHTML = '<option value="">Selecione uma história</option>'
    + builderState.stories.map(story => `<option value="${story.id}">${escapeHtml(story.title)}</option>`).join('');
  select.value = builderState.storyId;
  renderStoryGate();
}

export function selectBuilderStory(storyId) {
  builderState.storyId = storyId || '';
  const select = document.getElementById('builder-story-select');
  if (select) select.value = builderState.storyId;
  renderStoryGate();
}

export function loadBuilderPayload(payload) {
  const story = payload.story || builderState.stories.find(item => item.id === builderState.storyId) || null;
  builderState.storyId = story?.id || builderState.storyId;
  builderState.payload.story = story;
  builderState.payload.settings = payload.settings || {};
  builderState.payload.chatPresets = Array.isArray(payload.chatPresets) ? payload.chatPresets : [];
  builderState.payload.mediaMetadata = payload.mediaMetadata || {};
  builderState.payload.versions = payload.versions || [];
  builderState.payload.builderState = payload.builderState || { nodes: [], edges: [] };
  builderState.payload.storyForm = buildStoryForm(story, payload.settings || {});
  builderState.payload.guidedDescription = payload.settings?.guidedDescription || GUIDED_TEMPLATE;
  builderState.selectedNodeId = builderState.payload.builderState.nodes[0]?.id || '';

  loadPersistedDraft();
  hydrateAllBuilderForms();
  renderStepNavigation();
  renderBuilderCanvas();
  renderStructureList();
  renderDecisionList();
  renderBuilderVersions();
  renderFinalSummary();
  renderStoryGate();
}

function bindCoreActions({ onLoadStory, onGenerateBase, onSaveBuilder, onPublishBuilder }) {
  const storySelect = document.getElementById('builder-story-select');
  const guidedForm = document.getElementById('builder-guided-form');
  const reviewForm = document.getElementById('builder-review-form');
  const nodeForm = document.getElementById('builder-node-form');

  storySelect?.addEventListener('change', async event => {
    builderState.storyId = event.currentTarget.value;
    renderStoryGate();
    hydrateFromStory(builderState.stories.find(item => item.id === builderState.storyId));
    if (builderState.storyId) await onLoadStory(builderState.storyId);
  });

  guidedForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!builderState.storyId) return;
    const description = document.getElementById('builder-guided-description').value.trim();
    builderState.payload.guidedDescription = description || GUIDED_TEMPLATE;
    persistDraft();
    await onGenerateBase(builderState.storyId, buildGuidedInput(), collectBuilderMeta());
    goToStep(2);
  });

  reviewForm?.addEventListener('submit', event => {
    event.preventDefault();
    applyReviewForm();
    goToStep(3);
  });

  nodeForm?.addEventListener('submit', event => {
    event.preventDefault();
    applySelectedNodeFields();
    renderBuilderCanvas();
    renderStructureList();
    renderDecisionList();
    renderFinalSummary();
    persistDraft();
  });

  document.querySelectorAll('[data-builder-step-goto]').forEach(button => {
    button.addEventListener('click', () => goToStep(Number(button.dataset.builderStepGoto)));
  });

  document.querySelectorAll('[data-builder-step-next]').forEach(button => {
    button.addEventListener('click', () => {
      const nextStep = Number(button.dataset.builderStepNext);
      syncStepBeforeMove();
      goToStep(nextStep);
    });
  });

  document.querySelectorAll('[data-builder-step-back]').forEach(button => {
    button.addEventListener('click', () => {
      const previousStep = Number(button.dataset.builderStepBack);
      syncStepBeforeMove();
      goToStep(previousStep);
    });
  });

  document.querySelectorAll('[data-builder-add-node]').forEach(button => {
    button.addEventListener('click', () => {
      appendNode(button.dataset.builderAddNode);
      renderBuilderCanvas();
      renderStructureList();
      renderDecisionList();
      renderFinalSummary();
      persistDraft();
    });
  });

  document.querySelectorAll('[data-builder-save]').forEach(button => {
    button.addEventListener('click', async () => {
      syncAllStepData();
      await onSaveBuilder(builderState.storyId, collectBuilderMeta());
    });
  });

  document.querySelectorAll('[data-builder-publish]').forEach(button => {
    button.addEventListener('click', async () => {
      syncAllStepData();
      await onPublishBuilder(builderState.storyId, collectBuilderMeta());
    });
  });

  document.getElementById('builder-guided-fill-template')?.addEventListener('click', () => {
    const field = document.getElementById('builder-guided-description');
    const asPrompt = document.getElementById('builder-guided-as-prompt')?.checked;
    field.value = asPrompt ? buildPromptReadyTemplate() : GUIDED_TEMPLATE;
  });

  document.getElementById('builder-add-group-decision')?.addEventListener('click', () => appendNode('decisao_grupo'));
  document.getElementById('builder-add-personal-decision')?.addEventListener('click', () => appendNode('decisao_pessoal'));
}

function renderStoryGate() {
  document.querySelectorAll('[data-builder-needs-story]').forEach(node => {
    node.classList.toggle('hidden', !builderState.storyId);
  });
  const empty = document.getElementById('builder-empty-state');
  if (empty) empty.classList.toggle('hidden', Boolean(builderState.storyId));
}

function buildPromptReadyTemplate() {
  return `Copie este prompt em uma IA e ajuste as informacoes entre colchetes para gerar a descricao inicial da historia:

Crie uma descricao estruturada para um RPG narrativo usando exatamente estes campos:
Titulo provisorio: [nome da campanha]
Genero: [fantasia, horror, sci-fi, investigacao, drama etc.]
Tom: [epico, sombrio, leve, tenso etc.]
Ambientacao: [mundo, epoca, local e atmosfera]
Tema central: [ideia principal]
Tipo de jornada: [3 atos, jornada do heroi, missao, sobrevivencia etc.]
Quantidade de jogadores: [min-max]
Faixa de duracao: [curta, media, longa]
Resumo da premissa: [conflito principal]
Como a historia comeca: [cena inicial]
Possiveis conflitos: [riscos e dilemas]
Tipo de antagonista: [boss, faccao, entidade, sistema etc.]
Possiveis reviravoltas: [surpresas]
Como imagina o final: [final desejado ou possibilidades]
Referencias opcionais: [obras, estilos, jogos]
Restricoes e observacoes: [limites, temas proibidos, regras]`;
}

function buildGuidedInput() {
  const story = builderState.stories.find(item => item.id === builderState.storyId) || {};
  const description = document.getElementById('builder-guided-description').value.trim() || GUIDED_TEMPLATE;
  return {
    title: extractStructuredField(description, 'Título provisório') || story.title || '',
    premise: description,
    genre: extractStructuredField(description, 'Gênero') || '',
    tone: extractStructuredField(description, 'Tom') || story.tone_style || '',
    narrativeModel: extractStructuredField(description, 'Tipo de jornada') || '',
    guidedDescription: description
  };
}

function collectBuilderMeta() {
  syncAllStepData();
  return {
    builderState: builderState.payload.builderState,
    settings: {
      ...builderState.payload.settings,
      guidedDescription: builderState.payload.guidedDescription,
      storyForm: builderState.payload.storyForm,
      structureSummary: buildStructureSummary(),
      title: builderState.payload.storyForm.title || '',
      premise: builderState.payload.storyForm.lore_description || builderState.payload.storyForm.summary || '',
      genre: builderState.payload.storyForm.genre || '',
      tone: builderState.payload.storyForm.tone_style || '',
      narrativeModel: builderState.payload.settings.narrativeModel || ''
    },
    chatPresets: builderState.payload.chatPresets,
    mediaMetadata: builderState.payload.mediaMetadata
  };
}

function hydrateAllBuilderForms() {
  const form = builderState.payload.storyForm;
  document.getElementById('builder-guided-description').value = builderState.payload.guidedDescription || GUIDED_TEMPLATE;
  document.getElementById('builder-review-title').value = form.title || '';
  document.getElementById('builder-review-slug').value = form.slug || '';
  document.getElementById('builder-review-summary').value = form.summary || '';
  document.getElementById('builder-review-lore').value = form.lore_description || '';
  document.getElementById('builder-review-cover-text').value = form.cover_text || '';
  document.getElementById('builder-review-cover-url').value = form.cover_url || '';
  document.getElementById('builder-review-status').value = form.status || 'draft';
  document.getElementById('builder-review-system-base').value = form.system_base || 'generic';
  document.getElementById('builder-review-min-players').value = form.min_players || 1;
  document.getElementById('builder-review-max-players').value = form.max_players || 4;
  document.getElementById('builder-review-compatibility').value = form.character_compatibility || 'generic-flex';
  document.getElementById('builder-review-tags').value = Array.isArray(form.tags) ? form.tags.join(', ') : '';
  document.getElementById('builder-review-master-prompt').value = form.master_prompt || '';
  document.getElementById('builder-review-world-context').value = form.world_context || '';
  document.getElementById('builder-review-rules').value = form.narrative_rules || '';
  document.getElementById('builder-review-tone').value = form.tone_style || '';
  document.getElementById('builder-review-published').checked = Boolean(form.is_published);
  document.getElementById('builder-chat-presets').value = (builderState.payload.chatPresets || []).join('\n');
  document.getElementById('builder-media-image').value = builderState.payload.mediaMetadata.image || '';
  document.getElementById('builder-media-music').value = builderState.payload.mediaMetadata.music || '';
  document.getElementById('builder-media-acts').value = (builderState.payload.mediaMetadata.acts || []).map(item => `${item.label}|${item.sound}`).join('\n');
  document.getElementById('builder-review-ambient-sound').value = builderState.payload.mediaMetadata.ambientSound || '';
  hydrateSelectedNodeEditor();
}

function hydrateFromStory(story) {
  if (!story) return;
  builderState.payload.story = story;
  builderState.payload.storyForm = buildStoryForm(story, builderState.payload.settings || {});
  if (!builderState.payload.guidedDescription || builderState.payload.guidedDescription === GUIDED_TEMPLATE) {
    builderState.payload.guidedDescription = buildGuidedDescriptionFromStory(story);
  }
  hydrateAllBuilderForms();
  renderFinalSummary();
  persistDraft();
}

function buildStoryForm(story, settings) {
  const storyForm = settings?.storyForm || {};
  return {
    id: story?.id || '',
    title: storyForm.title || story?.title || '',
    slug: storyForm.slug || story?.slug || '',
    summary: storyForm.summary || story?.summary || '',
    lore_description: storyForm.lore_description || story?.lore_description || '',
    cover_text: storyForm.cover_text || story?.cover_text || '',
    cover_url: storyForm.cover_url || story?.cover_url || '',
    status: storyForm.status || story?.status || 'draft',
    system_base: storyForm.system_base || story?.system_base || 'generic',
    min_players: Number(storyForm.min_players || story?.min_players || 1),
    max_players: Number(storyForm.max_players || story?.max_players || 4),
    character_compatibility: storyForm.character_compatibility || story?.character_compatibility || 'generic-flex',
    tags: normalizeTags(storyForm.tags || story?.tags || []),
    master_prompt: storyForm.master_prompt || story?.master_prompt || '',
    world_context: storyForm.world_context || story?.world_context || '',
    narrative_rules: storyForm.narrative_rules || story?.narrative_rules || '',
    tone_style: storyForm.tone_style || story?.tone_style || '',
    is_published: storyForm.is_published ?? story?.is_published ?? false,
    genre: storyForm.genre || settings?.genre || '',
    prompt_cover: storyForm.prompt_cover || ''
  };
}

function buildGuidedDescriptionFromStory(story) {
  return `Título provisório: ${story.title || ''}
Gênero: 
Tom: ${story.tone_style || ''}
Ambientação: ${story.world_context || ''}
Tema central: 
Tipo de jornada: ${story.builder_settings?.narrativeModel || ''}
Quantidade de jogadores: ${story.min_players || 1}-${story.max_players || 4}
Faixa de duração: 
Resumo da premissa: ${story.lore_description || story.summary || ''}
Como a história começa: ${story.cover_text || ''}
Possíveis conflitos: 
Tipo de antagonista: 
Possíveis reviravoltas: 
Como imagina o final: 
Referências opcionais: 
Restrições e observações: ${story.narrative_rules || ''}`;
}

function renderStepNavigation() {
  document.querySelectorAll('[data-builder-step-index]').forEach((node, index) => {
    const stepNumber = index + 1;
    node.classList.toggle('active', stepNumber === builderState.currentStep);
    node.classList.toggle('done', stepNumber < builderState.currentStep);
  });

  document.querySelectorAll('[data-builder-step-panel]').forEach(panel => {
    panel.classList.toggle('active', Number(panel.dataset.builderStepPanel) === builderState.currentStep);
  });
}

function goToStep(step) {
  builderState.currentStep = Math.min(5, Math.max(1, step));
  renderStepNavigation();
  renderFinalSummary();
  persistDraft();
}

function syncStepBeforeMove() {
  if (builderState.currentStep === 1) {
    builderState.payload.guidedDescription = document.getElementById('builder-guided-description').value.trim() || GUIDED_TEMPLATE;
  }
  if (builderState.currentStep === 2) applyReviewForm();
  if (builderState.currentStep === 3 || builderState.currentStep === 4) applySelectedNodeFields();
}

function syncAllStepData() {
  builderState.payload.guidedDescription = document.getElementById('builder-guided-description').value.trim() || GUIDED_TEMPLATE;
  applyReviewForm();
  applySelectedNodeFields();
  builderState.payload.chatPresets = splitLines(document.getElementById('builder-chat-presets').value || '');
  builderState.payload.mediaMetadata = {
    image: document.getElementById('builder-media-image').value || '',
    music: document.getElementById('builder-media-music').value || '',
    ambientSound: document.getElementById('builder-review-ambient-sound').value || '',
    acts: splitLines(document.getElementById('builder-media-acts').value || '').map(line => {
      const [label, ...soundParts] = line.split('|');
      return { label: label?.trim() || 'Ato', sound: soundParts.join('|').trim() || '' };
    }).filter(item => item.sound)
  };
  if (!builderState.payload.storyForm.slug) {
    builderState.payload.storyForm.slug = slugify(builderState.payload.storyForm.title || 'historia-sem-titulo');
  }
  persistDraft();
}

function applyReviewForm() {
  builderState.payload.storyForm = {
    ...builderState.payload.storyForm,
    title: document.getElementById('builder-review-title').value.trim(),
    slug: slugify(document.getElementById('builder-review-slug').value.trim() || document.getElementById('builder-review-title').value.trim()),
    summary: document.getElementById('builder-review-summary').value.trim(),
    lore_description: document.getElementById('builder-review-lore').value.trim(),
    cover_text: document.getElementById('builder-review-cover-text').value.trim(),
    cover_url: document.getElementById('builder-review-cover-url').value.trim(),
    status: document.getElementById('builder-review-status').value.trim() || 'draft',
    system_base: document.getElementById('builder-review-system-base').value.trim() || 'generic',
    min_players: Number(document.getElementById('builder-review-min-players').value || 1),
    max_players: Number(document.getElementById('builder-review-max-players').value || 4),
    character_compatibility: document.getElementById('builder-review-compatibility').value.trim() || 'generic-flex',
    tags: normalizeTags(document.getElementById('builder-review-tags').value),
    master_prompt: document.getElementById('builder-review-master-prompt').value.trim(),
    world_context: document.getElementById('builder-review-world-context').value.trim(),
    narrative_rules: document.getElementById('builder-review-rules').value.trim(),
    tone_style: document.getElementById('builder-review-tone').value.trim(),
    is_published: document.getElementById('builder-review-published').checked
  };
}

function renderStructureList() {
  const container = document.getElementById('builder-structure-list');
  if (!container) return;
  const nodes = builderState.payload.builderState.nodes || [];
  container.innerHTML = nodes.length === 0
    ? '<div class="stack-item">Nenhuma estrutura gerada ainda.</div>'
    : nodes.map((node, index) => `
      <article class="stack-item structure-item ${structureClass(node.type)} ${node.id === builderState.selectedNodeId ? 'active' : ''}" data-structure-node-id="${node.id}">
        <div class="structure-item-head">
          <strong><span class="drag-handle" aria-hidden="true">::</span>${escapeHtml(node.data?.title || labelByType(node.type))}</strong>
          <span>${escapeHtml(node.type)}</span>
        </div>
        <p>${escapeHtml(node.data?.text || 'Sem descrição.')}</p>
        <div class="actions">
          <button type="button" class="btn ghost" data-structure-select="${node.id}">Editar</button>
          <button type="button" class="btn ghost" data-structure-up="${node.id}" ${index === 0 ? 'disabled' : ''}>Subir</button>
          <button type="button" class="btn ghost" data-structure-down="${node.id}" ${index === nodes.length - 1 ? 'disabled' : ''}>Descer</button>
          <button type="button" class="btn ghost" data-structure-remove="${node.id}">Remover</button>
        </div>
      </article>
    `).join('');

  container.querySelectorAll('[data-structure-select]').forEach(button => {
    button.addEventListener('click', () => {
      builderState.selectedNodeId = button.dataset.structureSelect;
      hydrateSelectedNodeEditor();
      renderStructureList();
      renderDecisionList();
    });
  });
  container.querySelectorAll('[data-structure-up]').forEach(button => button.addEventListener('click', () => moveNode(button.dataset.structureUp, -1)));
  container.querySelectorAll('[data-structure-down]').forEach(button => button.addEventListener('click', () => moveNode(button.dataset.structureDown, 1)));
  container.querySelectorAll('[data-structure-remove]').forEach(button => button.addEventListener('click', () => {
    removeNode(button.dataset.structureRemove);
  }));
  initStructureSortable(container);
}

function initStructureSortable(container) {
  if (!window.Sortable || container.dataset.sortableReady === 'true') return;
  window.Sortable.create(container, {
    animation: 160,
    handle: '.drag-handle',
    draggable: '[data-structure-node-id]',
    onEnd: () => {
      const orderedIds = Array.from(container.querySelectorAll('[data-structure-node-id]')).map(item => item.dataset.structureNodeId);
      reorderNodes(orderedIds);
    }
  });
  container.dataset.sortableReady = 'true';
}

function renderDecisionList() {
  const container = document.getElementById('builder-decision-list');
  if (!container) return;
  const decisions = (builderState.payload.builderState.nodes || []).filter(node => node.type === 'decisao_grupo' || node.type === 'decisao_pessoal');
  container.innerHTML = decisions.length === 0
    ? '<div class="stack-item">Nenhuma decisão configurada ainda.</div>'
    : decisions.map(node => `
      <article class="stack-item structure-item ${node.id === builderState.selectedNodeId ? 'active' : ''}">
        <div class="structure-item-head">
          <strong>${escapeHtml(node.data?.title || labelByType(node.type))}</strong>
          <span>${node.type === 'decisao_grupo' ? 'Grupo' : 'Pessoal'}</span>
        </div>
        <p>${escapeHtml(node.data?.text || 'Sem prompt narrativo.')}</p>
        <p>Opções: ${(node.data?.options || []).length}</p>
        <div class="actions">
          <button type="button" class="btn ghost" data-decision-edit="${node.id}">Editar decisão</button>
        </div>
      </article>
    `).join('');

  container.querySelectorAll('[data-decision-edit]').forEach(button => button.addEventListener('click', () => {
    builderState.selectedNodeId = button.dataset.decisionEdit;
    hydrateSelectedNodeEditor();
    renderDecisionList();
    renderStructureList();
  }));
}

function renderBuilderCanvas() {
  const surface = document.getElementById('builder-canvas');
  if (!surface) return;
  const nodes = builderState.payload.builderState.nodes || [];
  const edges = ensureEdges();
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
    ${nodes.map(node => `
      <article class="builder-node ${laneClassByType(node.type)}${node.id === builderState.selectedNodeId ? ' selected' : ''}" data-builder-node="${node.id}" style="left:${node.position?.x || 0}px;top:${node.position?.y || 0}px;">
        <header class="builder-node-head">
          <span>${escapeHtml(node.type.replace('_', ' '))}</span>
          <button type="button" class="builder-link-btn" data-builder-node-select="${node.id}">Editar</button>
        </header>
        <strong>${escapeHtml(node.data?.title || labelByType(node.type))}</strong>
        <p>${escapeHtml(node.data?.text || 'Sem descrição.')}</p>
      </article>
    `).join('')}
  `;
  surface.style.minWidth = `${maxX}px`;
  surface.style.minHeight = `${maxY}px`;

  surface.querySelectorAll('[data-builder-node-select]').forEach(button => button.addEventListener('click', () => {
    builderState.selectedNodeId = button.dataset.builderNodeSelect;
    hydrateSelectedNodeEditor();
    renderStructureList();
    renderDecisionList();
    renderBuilderCanvas();
  }));
  initCanvasDrag(surface);
}

function initCanvasDrag(surface) {
  surface.querySelectorAll('[data-builder-node]').forEach(card => {
    card.addEventListener('pointerdown', event => {
      if (event.target.closest('button, input, textarea, select')) return;
      const node = findNode(card.dataset.builderNode);
      if (!node) return;

      builderState.selectedNodeId = node.id;
      hydrateSelectedNodeEditor();
      renderStructureList();
      renderDecisionList();
      card.classList.add('dragging', 'selected');
      card.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = node.position?.x || 0;
      const startTop = node.position?.y || 0;
      let moved = false;

      const onMove = moveEvent => {
        const nextX = Math.max(0, startLeft + moveEvent.clientX - startX);
        const nextY = Math.max(0, startTop + moveEvent.clientY - startY);
        moved = moved || Math.abs(nextX - startLeft) > 3 || Math.abs(nextY - startTop) > 3;
        node.position = { x: nextX, y: nextY };
        card.style.left = `${nextX}px`;
        card.style.top = `${nextY}px`;
      };

      const onEnd = () => {
        card.classList.remove('dragging');
        card.removeEventListener('pointermove', onMove);
        card.removeEventListener('pointerup', onEnd);
        card.removeEventListener('pointercancel', onEnd);
        if (moved) {
          renderBuilderCanvas();
          renderFinalSummary();
          persistDraft();
        }
      };

      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerup', onEnd);
      card.addEventListener('pointercancel', onEnd);
    });
  });
}

function hydrateSelectedNodeEditor() {
  const node = getSelectedNode();
  const form = document.getElementById('builder-node-form');
  form?.classList.toggle('muted-panel', !node);
  document.getElementById('builder-node-type').value = node?.type || 'evento';
  document.getElementById('builder-node-title').value = node?.data?.title || '';
  document.getElementById('builder-node-text').value = node?.data?.text || '';
  document.getElementById('builder-node-goal').value = node?.data?.goal || '';
  document.getElementById('builder-node-options').value = (node?.data?.options || []).map(option => [option.label, option.text, option.targetNodeId].filter(Boolean).join('|')).join('\n');
}

function applySelectedNodeFields() {
  const node = getSelectedNode();
  if (!node) return;
  node.type = document.getElementById('builder-node-type').value || node.type;
  node.data.title = document.getElementById('builder-node-title').value || '';
  node.data.text = document.getElementById('builder-node-text').value || '';
  node.data.goal = document.getElementById('builder-node-goal').value || '';
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
  const index = builderState.payload.builderState.nodes.length;
  const id = `${type}-${Date.now()}`;
  builderState.payload.builderState.nodes.push({
    id,
    type,
    position: { x: 100 + index * 200, y: 120 + (index % 3) * 140 },
    data: {
      title: labelByType(type),
      text: '',
      goal: '',
      options: type.includes('decisao')
        ? [
            { id: `${id}-opt-1`, label: 'Opção 1', text: '', targetNodeId: '' },
            { id: `${id}-opt-2`, label: 'Opção 2', text: '', targetNodeId: '' }
          ]
        : []
    }
  });
  builderState.selectedNodeId = id;
  ensureEdges();
  hydrateSelectedNodeEditor();
  renderBuilderCanvas();
  renderStructureList();
  renderDecisionList();
  renderFinalSummary();
  persistDraft();
}

function moveNode(nodeId, direction) {
  const nodes = builderState.payload.builderState.nodes;
  const index = nodes.findIndex(node => node.id === nodeId);
  if (index < 0) return;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= nodes.length) return;
  [nodes[index], nodes[targetIndex]] = [nodes[targetIndex], nodes[index]];
  updateNodePositions();
  ensureEdges();
  renderBuilderCanvas();
  renderStructureList();
  renderDecisionList();
  renderFinalSummary();
  persistDraft();
}

function reorderNodes(orderedIds) {
  const nodes = builderState.payload.builderState.nodes || [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  builderState.payload.builderState.nodes = orderedIds.map(id => byId.get(id)).filter(Boolean);
  updateNodePositions();
  ensureEdges();
  renderBuilderCanvas();
  renderDecisionList();
  renderFinalSummary();
  persistDraft();
}

function structureClass(type) {
  if (type === 'decisao_grupo') return 'structure-group';
  if (type === 'decisao_pessoal') return 'structure-personal';
  return '';
}

function removeNode(nodeId) {
  builderState.payload.builderState.nodes = builderState.payload.builderState.nodes.filter(node => node.id !== nodeId);
  builderState.payload.builderState.edges = (builderState.payload.builderState.edges || []).filter(edge => edge.source !== nodeId && edge.target !== nodeId);
  builderState.selectedNodeId = builderState.payload.builderState.nodes[0]?.id || '';
  updateNodePositions();
  ensureEdges();
  hydrateSelectedNodeEditor();
  renderBuilderCanvas();
  renderStructureList();
  renderDecisionList();
  renderFinalSummary();
  persistDraft();
}

function ensureEdges() {
  const nodes = builderState.payload.builderState.nodes || [];
  const edges = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push({
      id: `edge-${index + 1}`,
      source: nodes[index].id,
      target: nodes[index + 1].id,
      kind: 'flow'
    });
  }
  builderState.payload.builderState.edges = edges;
  return edges;
}

function updateNodePositions() {
  builderState.payload.builderState.nodes.forEach((node, index) => {
    node.position = { x: 100 + index * 200, y: 120 + (index % 3) * 140 };
  });
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

function renderFinalSummary() {
  const container = document.getElementById('builder-final-summary');
  if (!container) return;
  const storyForm = builderState.payload.storyForm || {};
  const nodes = builderState.payload.builderState.nodes || [];
  const decisions = nodes.filter(node => node.type.includes('decisao'));
  container.innerHTML = `
    <article class="stack-item">
      <h4>${escapeHtml(storyForm.title || 'História sem título')}</h4>
      <p>${escapeHtml(storyForm.summary || storyForm.lore_description || 'Sem resumo gerado ainda.')}</p>
      <p>Status: ${escapeHtml(storyForm.status || 'draft')} | Slug: ${escapeHtml(storyForm.slug || 'pendente')}</p>
    </article>
    <article class="stack-item">
      <h4>Validação rápida</h4>
      <p>Blocos: ${nodes.length}</p>
      <p>Decisões: ${decisions.length}</p>
      <p>Jogadores: ${storyForm.min_players || 1}-${storyForm.max_players || 4}</p>
    </article>
    <article class="stack-item">
      <h4>Fallbacks</h4>
      <p>Se a IA falhar, os campos continuam editáveis manualmente e o fluxo não trava.</p>
    </article>
  `;
}

function buildStructureSummary() {
  const nodes = builderState.payload.builderState.nodes || [];
  return {
    inicio: nodes.filter(node => node.type === 'start').map(node => node.data.title),
    meio: nodes.filter(node => ['ato', 'evento', 'surpresa'].includes(node.type)).map(node => node.data.title),
    final: nodes.filter(node => ['boss', 'final'].includes(node.type)).map(node => node.data.title),
    decisoes: nodes.filter(node => node.type.includes('decisao')).map(node => node.data.title),
    finaisAlternativos: nodes.filter(node => node.type === 'final').map(node => node.data.text || node.data.title)
  };
}

function loadPersistedDraft() {
  const key = getDraftKey();
  if (!key) return;
  const raw = window.localStorage.getItem(key);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    builderState.currentStep = draft.currentStep || 1;
    builderState.payload.guidedDescription = draft.guidedDescription || builderState.payload.guidedDescription;
  } catch {}
}

function persistDraft() {
  const key = getDraftKey();
  if (!key) return;
  window.localStorage.setItem(key, JSON.stringify({
    currentStep: builderState.currentStep,
    guidedDescription: builderState.payload.guidedDescription
  }));
}

function getDraftKey() {
  return builderState.storyId ? `builder-stepper:${builderState.storyId}` : '';
}

function getSelectedNode() {
  return (builderState.payload.builderState.nodes || []).find(node => node.id === builderState.selectedNodeId) || null;
}

function extractStructuredField(text, label) {
  const regex = new RegExp(`${label}:\\s*(.*)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() || '';
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function splitLines(value) {
  return String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'historia-sem-titulo';
}

function labelByType(type) {
  return {
    start: 'Início',
    ato: 'Ato',
    evento: 'Evento',
    decisao_grupo: 'Decisão em grupo',
    decisao_pessoal: 'Decisão pessoal',
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
