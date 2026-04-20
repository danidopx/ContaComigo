import { getSessionBundle, getUserFromRequest, handleOptions, json, userIsAdmin } from './_lib.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido' });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json(res, 401, { error: 'Usuário não autenticado.' });

    const sessionId = req.query.sessionId;
    const bundle = await getSessionBundle(sessionId);
    const isParticipant = bundle.players.some(player => player.user_id === user.id);
    if (!isParticipant && !userIsAdmin(user)) return json(res, 403, { error: 'Acesso negado à sessão.' });
    return json(res, 200, bundle.decisionStatus);
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
