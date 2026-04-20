import { appState, getSb } from './config.js';

export async function signInWithGoogle() {
  const sb = getSb();
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) throw error;
}

export async function signOut() {
  const sb = getSb();
  await sb.auth.signOut();
}

export async function ensureProfile() {
  const sb = getSb();
  if (!appState.user) return;

  await sb.from('profiles').upsert({
    id: appState.user.id,
    email: appState.user.email,
    full_name: appState.user.user_metadata?.full_name || appState.user.user_metadata?.name || appState.user.email
  }, { onConflict: 'id' });
}

export async function loadAdminState() {
  const sb = getSb();
  if (!appState.user) {
    appState.isAdmin = false;
    return false;
  }

  const { data } = await sb.from('user_roles').select('role').eq('user_id', appState.user.id);
  appState.isAdmin = Boolean(
    (Array.isArray(data) && data.some(item => item.role === 'admin'))
    || appState.user.email === appState.publicConfig?.adminEmail
  );
  return appState.isAdmin;
}

export async function getAccessToken() {
  const sb = getSb();
  const { data } = await sb.auth.getSession();
  return data.session?.access_token || '';
}

export async function initAuth(onChange) {
  const sb = getSb();
  const { data } = await sb.auth.getSession();
  appState.user = data.session?.user || null;
  if (appState.user) {
    await ensureProfile();
    await loadAdminState();
  }
  await onChange(appState.user);

  sb.auth.onAuthStateChange(async (_event, session) => {
    appState.user = session?.user || null;
    if (appState.user) {
      await ensureProfile();
      await loadAdminState();
    } else {
      appState.isAdmin = false;
    }
    await onChange(appState.user);
  });
}
