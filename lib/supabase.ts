import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOwnerClientHeaders } from '@/lib/clientRelease';

// @supabase/auth-js unconditionally console.errors a stale/invalid refresh
// token (GoTrueClient#_recoverAndRefresh, #_callRefreshToken) even though it
// already clears the persisted session and emits SIGNED_OUT for this exact
// case internally (it's a non-retryable AuthApiError, so _removeSession()
// always runs) -- our onAuthStateChange handler already reacts to SIGNED_OUT
// by clearing app state, and every authenticated layout already redirects to
// its login screen once isAuthenticated flips false. The console.error is
// pure noise for an already-handled, non-actionable case; only that log call
// is suppressed here, nothing else.
// The GoTrue server reports an unusable stored refresh token under several
// distinct messages/codes depending on why it's unusable (not found,
// already used, fails its format check, ...) -- matched on message content
// rather than a fixed code list since that list is server-defined and not
// guaranteed complete.
const isStaleRefreshTokenAuthError = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  (value as { name?: unknown }).name === 'AuthApiError' &&
  /refresh token/i.test(String((value as { message?: unknown }).message));

const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (args.some(isStaleRefreshTokenAuthError)) return;
  originalConsoleError(...args);
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__) {
  console.log('[Supabase] URL configured:', supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'MISSING');
  console.log('[Supabase] Anon key configured:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 10)}...` : 'MISSING');
}

let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: getOwnerClientHeaders(),
    },
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
} else {
  console.warn('[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY — Supabase disabled');
  supabase = null as unknown as SupabaseClient;
}

export { supabase };
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);
