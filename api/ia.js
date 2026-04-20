import { generateWithGemini } from './_gemini.js';
import { handleOptions, json } from './_lib.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });

  try {
    const { prompt, modelo } = req.body || {};
    const data = await generateWithGemini({ prompt, modelo });
    return json(res, 200, data.payload);
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
