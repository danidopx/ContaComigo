const MODELOS_FALLBACK = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function chamarGemini({ prompt, modelo, apiKey }) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  const corpo = await response.text().catch(() => '');
  return { response, corpo };
}

export async function generateWithGemini({ prompt, modelo }) {
  const apiKey = process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Variável GEMINI_KEY não configurada no ambiente.');

  const modelosParaTentar = [modelo, ...MODELOS_FALLBACK.filter(item => item && item !== modelo)];
  let ultimoStatus = 500;
  let ultimoErro = 'Erro desconhecido ao chamar a API Gemini.';

  for (const modeloAtual of modelosParaTentar) {
    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      const { response, corpo } = await chamarGemini({ prompt, modelo: modeloAtual, apiKey });

      if (response.ok) {
        return {
          model: modeloAtual,
          payload: JSON.parse(corpo),
          raw: corpo
        };
      }

      ultimoStatus = response.status;
      ultimoErro = corpo || `HTTP ${response.status}`;

      const indisponivel = response.status === 503 && ultimoErro.includes('"status": "UNAVAILABLE"');
      if (indisponivel && tentativa === 0) {
        await esperar(1200);
        continue;
      }
      if (!indisponivel) break;
    }
  }

  throw new Error(`Gemini falhou (${ultimoStatus}): ${ultimoErro}`);
}
