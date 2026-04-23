import { getSessionBundle, getUserFromRequest, handleOptions, json, logSessionEvent, userIsAdmin } from './_lib.js';

const DICE_PRESETS = {
  d20: { count: 1, sides: 20, label: 'd20' },
  d10: { count: 1, sides: 10, label: 'd10' },
  '2d6': { count: 2, sides: 6, label: '2d6' }
};

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json(res, 401, { error: 'Usuário não autenticado.' });

    if (req.method === 'GET') {
      const sessionId = req.query.sessionId;
      const bundle = await getSessionBundle(sessionId);
      const isParticipant = bundle.players.some(player => player.user_id === user.id);
      if (!isParticipant && !userIsAdmin(user)) return json(res, 403, { error: 'Acesso negado à sessão.' });

      const events = bundle.events.filter(event => event.event_type === 'dice_roll');
      return json(res, 200, {
        items: events.map(event => ({
          id: event.id,
          created_at: event.created_at,
          ...event.payload
        }))
      });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });

    const { sessionId, dice } = req.body || {};
    const preset = DICE_PRESETS[dice];
    if (!preset) return json(res, 400, { error: 'Rolagem inválida. Use d20, d10 ou 2d6.' });

    const bundle = await getSessionBundle(sessionId);
    const player = bundle.players.find(item => item.user_id === user.id);
    if (!player && !userIsAdmin(user)) return json(res, 403, { error: 'Acesso negado à sessão.' });

    const rolls = Array.from({ length: preset.count }, () => 1 + Math.floor(Math.random() * preset.sides));
    const total = rolls.reduce((sum, item) => sum + item, 0);

    await logSessionEvent(sessionId, 'dice_roll', {
      userId: user.id,
      playerId: player?.id || null,
      actor: player?.character?.name || player?.profile?.full_name || user.email || 'Jogador',
      dice: preset.label,
      rolls,
      total
    });

    return json(res, 200, {
      dice: preset.label,
      rolls,
      total
    });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
