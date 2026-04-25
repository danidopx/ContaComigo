import { appState, getSb } from './config.js';

export async function signInWithGoogle() {
  const sb = getSb();
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account'
      }
    }
  });
  if (error) throw error;
}

export async function signOut() {
  const sb = getSb();
  await sb.auth.signOut();
  appState.user = null;
  appState.isAdmin = false;
  appState.currentSession = null;
  appState.currentState = null;
  cleanupAuthUrl();
  cleanupStoredAuth();
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

  if (appState.user.email === 'dop.jr82@gmail.com' || appState.user.email === appState.publicConfig?.adminEmail) {
    appState.isAdmin = true;
    return true;
  }

  const { data, error } = await sb.from('user_roles').select('role').eq('user_id', appState.user.id);
  if (error) {
    appState.isAdmin = false;
    return false;
  }

  appState.isAdmin = Boolean(Array.isArray(data) && data.some(item => item.role === 'admin'));
  return appState.isAdmin;
}

export async function getAccessToken() {
  const sb = getSb();
  const { data } = await sb.auth.getSession();
  return data.session?.access_token || '';
}

export async function initAuth(onChange) {
  const sb = getSb();
  if (window.location.search.includes('code=') || window.location.hash.includes('access_token=')) {
    await sb.auth.getSession().catch(() => null);
    cleanupAuthUrl();
  }

  const { data, error } = await sb.auth.getSession();
  if (error) {
    await sb.auth.signOut().catch(() => null);
    cleanupStoredAuth();
  }
  appState.user = error ? null : data.session?.user || null;
  if (appState.user) {
    try {
      await ensureProfile();
      await loadAdminState();
    } catch {
      await sb.auth.signOut().catch(() => null);
      cleanupStoredAuth();
      appState.user = null;
      appState.isAdmin = false;
    }
  }
  await onChange(appState.user);

  sb.auth.onAuthStateChange(async (_event, session) => {
    cleanupAuthUrl();
    appState.user = session?.user || null;
    if (appState.user) {
      try {
        await ensureProfile();
        await loadAdminState();
      } catch {
        await sb.auth.signOut().catch(() => null);
        cleanupStoredAuth();
        appState.user = null;
        appState.isAdmin = false;
      }
    } else {
      appState.isAdmin = false;
    }
    await onChange(appState.user);
  });
}

function cleanupAuthUrl() {
  if (!window.location.hash && !window.location.search.includes('code=')) return;
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

function cleanupStoredAuth() {
  [window.localStorage, window.sessionStorage].forEach(storage => {
    Object.keys(storage)
      .filter(key => key.startsWith('sb-') || key.includes('supabase.auth.token'))
      .forEach(key => storage.removeItem(key));
  });
}
