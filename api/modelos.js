import { handleOptions, json } from './_lib.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido' });

  const apiKey = process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return json(res, 200, { models: [] });

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const payload = await response.json().catch(() => ({ models: [] }));
  if (!response.ok) return json(res, response.status, { error: payload.error?.message || 'Falha ao listar modelos.' });
  return json(res, 200, payload);
}
