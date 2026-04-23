const NODE_TYPE_META = {
  start: { label: 'Inicio', lane: 'start', decisionKind: null },
  ato: { label: 'Ato', lane: 'middle', decisionKind: null },
  evento: { label: 'Evento', lane: 'middle', decisionKind: null },
  decisao_grupo: { label: 'Decisao em grupo', lane: 'middle', decisionKind: 'group' },
  decisao_pessoal: { label: 'Decisao pessoal', lane: 'middle', decisionKind: 'personal' },
  surpresa: { label: 'Surpresa', lane: 'middle', decisionKind: null },
  boss: { label: 'Boss', lane: 'end', decisionKind: null },
  final: { label: 'Final', lane: 'end', decisionKind: null }
};

export function getNodeTypeMeta(type) {
  return NODE_TYPE_META[type] || NODE_TYPE_META.evento;
}

export function createDefaultBuilderState() {
  return {
    nodes: [
      createNode('start', { x: 80, y: 120, title: 'Inicio da aventura', text: 'Apresente o mundo e o chamado inicial.' }),
      createNode('evento', { x: 360, y: 120, title: 'Primeiro evento', text: 'Mostre o primeiro desafio do grupo.' }),
      createNode('decisao_grupo', {
        x: 660,
        y: 120,
        title: 'Escolha em grupo',
        text: 'O grupo precisa escolher um rumo.',
        options: [
          { id: 'opt-a', label: 'Seguir pela rota segura', text: 'Menor risco imediato.' },
          { id: 'opt-b', label: 'Apostar em um atalho', text: 'Mais risco e mais recompensa.' }
        ]
      }),
      createNode('final', { x: 980, y: 120, title: 'Desfecho', text: 'Conduza para um final coerente.' })
    ],
    edges: []
  };
}

export function normalizeBuilderState(rawState) {
  const base = createDefaultBuilderState();
  const source = rawState && typeof rawState === 'object' ? rawState : {};
  const nodes = Array.isArray(source.nodes) && source.nodes.length ? source.nodes : base.nodes;
  const edges = Array.isArray(source.edges) ? source.edges : inferEdgesFromNodes(nodes);

  return {
    nodes: nodes.map((node, index) => normalizeNode(node, index)),
    edges: dedupeEdges(edges.map((edge, index) => normalizeEdge(edge, index)))
  };
}

export function compileBuilderState(story, builderState) {
  const state = normalizeBuilderState(builderState);
  const nodesById = new Map(state.nodes.map(node => [node.id, node]));
  const outgoing = buildAdjacency(state.edges);
  const orderedNodes = orderNodes(state.nodes, outgoing);
  const structuralNodes = [];
  const decisions = [];
  let lastChapterNodeId = null;

  for (const node of orderedNodes) {
    const meta = getNodeTypeMeta(node.type);
    if (meta.decisionKind) {
      decisions.push(compileDecisionNode(node, lastChapterNodeId, outgoing, nodesById));
      continue;
    }

    const nextNodeIds = outgoing[node.id] || [];
    const compiledChapter = {
      nodeId: node.id,
      title: node.data.title || meta.label,
      nodeType: node.type,
      openingText: node.data.text || node.data.summary || meta.label,
      chapterGoal: node.data.goal || node.data.transition || 'Avancar a narrativa respeitando o builder.',
      chapterOrder: structuralNodes.length + 1,
      metadata: {
        lane: meta.lane,
        nextNodeIds,
        image: node.data.image || '',
        music: node.data.music || '',
        color: node.data.color || '',
        isFinal: node.type === 'final'
      }
    };
    structuralNodes.push(compiledChapter);
    lastChapterNodeId = node.id;
  }

  const decisionsByChapter = structuralNodes.reduce((accumulator, chapter) => {
    accumulator[chapter.nodeId] = decisions.filter(item => item.chapterNodeId === chapter.nodeId);
    return accumulator;
  }, {});

  return {
    startNodeId: structuralNodes[0]?.nodeId || null,
    orderedNodeIds: orderedNodes.map(node => node.id),
    chapters: structuralNodes,
    decisions,
    decisionsByChapter,
    checkpoint: `builder:${new Date().toISOString()}`
  };
}

export function buildInitialBuilderFromGeneration(input, parsedPayload) {
  const nodes = Array.isArray(parsedPayload?.nodes) ? parsedPayload.nodes : [];
  const edges = Array.isArray(parsedPayload?.edges) ? parsedPayload.edges : [];
  const fallback = createDefaultBuilderState();
  const title = input?.title || 'Nova historia';

  const seededNodes = (nodes.length ? nodes : fallback.nodes).map((node, index) => normalizeNode({
    ...node,
    data: {
      ...node.data,
      title: node.data?.title || node.title || `${title} ${index + 1}`
    }
  }, index));

  return normalizeBuilderState({
    nodes: seededNodes,
    edges: edges.length ? edges : inferEdgesFromNodes(seededNodes)
  });
}

function createNode(type, { x, y, title, text, options = [] }) {
  const nodeId = `${type}-${Math.random().toString(36).slice(2, 8)}`;
  return normalizeNode({
    id: nodeId,
    type,
    position: { x, y },
    data: {
      title,
      text,
      options
    }
  });
}

function normalizeNode(node, index = 0) {
  const type = NODE_TYPE_META[node?.type] ? node.type : 'evento';
  const meta = getNodeTypeMeta(type);
  const id = node?.id || `${type}-${index + 1}`;
  const position = node?.position && typeof node.position === 'object'
    ? { x: Number(node.position.x || 80 + index * 220), y: Number(node.position.y || 120) }
    : { x: 80 + index * 220, y: 120 };
  const rawData = node?.data && typeof node.data === 'object' ? node.data : {};
  const options = Array.isArray(rawData.options)
    ? rawData.options.map((option, optionIndex) => ({
        id: option?.id || `${id}-opt-${optionIndex + 1}`,
        label: option?.label || `Opcao ${optionIndex + 1}`,
        text: option?.text || '',
        targetNodeId: option?.targetNodeId || ''
      }))
    : [];

  return {
    id,
    type,
    position,
    data: {
      title: rawData.title || meta.label,
      text: rawData.text || '',
      summary: rawData.summary || '',
      goal: rawData.goal || '',
      transition: rawData.transition || '',
      color: rawData.color || '',
      image: rawData.image || '',
      music: rawData.music || '',
      options
    }
  };
}

function normalizeEdge(edge, index = 0) {
  return {
    id: edge?.id || `edge-${index + 1}`,
    source: edge?.source || '',
    target: edge?.target || '',
    label: edge?.label || '',
    kind: edge?.kind || 'flow'
  };
}

function inferEdgesFromNodes(nodes) {
  const edges = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push({
      id: `edge-auto-${index + 1}`,
      source: nodes[index].id,
      target: nodes[index + 1].id,
      label: '',
      kind: 'flow'
    });
  }
  return edges;
}

function dedupeEdges(edges) {
  const seen = new Set();
  return edges.filter(edge => {
    if (!edge.source || !edge.target) return false;
    const key = `${edge.source}:${edge.target}:${edge.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildAdjacency(edges) {
  return edges.reduce((accumulator, edge) => {
    accumulator[edge.source] ||= [];
    accumulator[edge.source].push(edge.target);
    return accumulator;
  }, {});
}

function orderNodes(nodes, outgoing) {
  const sorted = [...nodes].sort((left, right) => {
    if ((left.position.x || 0) === (right.position.x || 0)) return (left.position.y || 0) - (right.position.y || 0);
    return (left.position.x || 0) - (right.position.x || 0);
  });
  const startNode = sorted.find(node => node.type === 'start') || sorted[0];
  const visited = new Set();
  const ordered = [];

  function visit(nodeId) {
    if (!nodeId || visited.has(nodeId)) return;
    const node = sorted.find(item => item.id === nodeId);
    if (!node) return;
    visited.add(nodeId);
    ordered.push(node);
    for (const targetId of outgoing[nodeId] || []) visit(targetId);
  }

  visit(startNode?.id);
  for (const node of sorted) visit(node.id);
  return ordered;
}

function compileDecisionNode(node, lastChapterNodeId, outgoing, nodesById) {
  const optionsFromNode = Array.isArray(node.data.options) ? node.data.options : [];
  const targets = outgoing[node.id] || [];
  const options = (optionsFromNode.length ? optionsFromNode : targets.map((targetId, index) => ({
    id: `${node.id}-opt-${index + 1}`,
    label: `Opcao ${index + 1}`,
    text: '',
    targetNodeId: targetId
  }))).map((option, index) => ({
    id: option.id || `${node.id}-opt-${index + 1}`,
    optionKey: option.id || `${node.id}-opt-${index + 1}`,
    label: option.label || `Opcao ${index + 1}`,
    description: option.text || '',
    targetNodeId: option.targetNodeId || targets[index] || '',
    consequenceHint: nodesById.get(option.targetNodeId || targets[index] || '')?.data?.title || ''
  }));

  return {
    nodeId: node.id,
    chapterNodeId: lastChapterNodeId,
    title: node.data.title || getNodeTypeMeta(node.type).label,
    prompt: node.data.text || 'Escolha um caminho para continuar a historia.',
    description: node.data.summary || '',
    visibilityMode: node.type === 'decisao_pessoal' ? 'hidden' : 'visible',
    decisionKind: getNodeTypeMeta(node.type).decisionKind || 'group',
    options
  };
}
