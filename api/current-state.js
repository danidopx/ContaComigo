import { getCompatiblePlayerCharacters, getSessionBundle, getUserFromRequest, handleOptions, json, userIsAdmin } from './_lib.js';
import { maybeAdaptIntro } from './_narrative.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido' });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json(res, 401, { error: 'Usuário não autenticado.' });

    const bundle = await getSessionBundle(req.query.sessionId);
    const isParticipant = bundle.players.some(player => player.user_id === user.id);
    if (!isParticipant && !userIsAdmin(user)) return json(res, 403, { error: 'Acesso negado à sessão.' });
    const adaptedNarration = await maybeAdaptIntro(req.query.sessionId, bundle).catch(() => null);
    const compatibleCharacters = await getCompatiblePlayerCharacters(user.id, bundle.story).catch(() => []);
    return json(res, 200, {
      ...bundle,
      chapterState: adaptedNarration
        ? {
            ...(bundle.chapterState || {}),
            narration: adaptedNarration
          }
        : bundle.chapterState,
      compatibleCharacters,
      adaptedNarration
    });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
