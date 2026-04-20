export const DEFAULT_PROMPTS_BY_NAME = {
  narration_main: { label: 'Narração principal', content: 'Você é o narrador principal de um RPG cooperativo. Continue a história em português do Brasil mantendo coerência, tensão e consequências reais.' },
  chapter_continue: { label: 'Continuação de capítulo', content: 'Continue o capítulo atual após receber o contexto da sessão, regras e decisões. Responda em JSON.' },
  interpret_decisions: { label: 'Interpretação de decisões', content: 'Interprete as decisões conjuntas dos jogadores, respeitando escolhas ocultas, visíveis e reveladas depois.' },
  session_summary: { label: 'Resumo da sessão', content: 'Resuma a rodada em tom objetivo e dramático, destacando eventos, riscos e desdobramentos.' },
  impact_individual: { label: 'Impacto individual', content: 'Descreva impacto individual por personagem considerando classe, atributos e decisão tomada.' },
  impact_global: { label: 'Impacto global', content: 'Descreva impacto global na história, no mundo e no estado do grupo.' },
  fallback: { label: 'Fallback', content: 'Se faltar contexto, gere um resultado conservador, coerente e jogável.' }
};

export const appState = {
  user: null,
  isAdmin: false,
  stories: [],
  sessions: [],
  currentSession: null,
  currentState: null,
  publicConfig: null,
  sb: null
};

export async function initPublicConfig() {
  if (appState.publicConfig && appState.sb) return appState.publicConfig;

  const response = await fetch('/api/public-config', { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível carregar a configuração pública.');

  const config = await response.json();
  const supabaseLib = globalThis.supabase;
  if (!supabaseLib?.createClient) throw new Error('Biblioteca Supabase indisponível no frontend.');

  appState.publicConfig = config;
  appState.sb = supabaseLib.createClient(config.supabaseUrl, config.supabaseAnonKey);
  return config;
}

export function getSb() {
  if (!appState.sb) throw new Error('Supabase ainda não foi inicializado.');
  return appState.sb;
}
