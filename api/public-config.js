import { handleOptions, json, APP_ADMIN_EMAIL, SUPABASE_ANON_KEY, SUPABASE_URL } from './_lib.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido' });

  return json(res, 200, {
    appName: 'ContaComigo',
    adminEmail: APP_ADMIN_EMAIL,
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY
  });
}
