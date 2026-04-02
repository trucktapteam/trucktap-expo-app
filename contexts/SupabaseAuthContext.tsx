import { useState, useEffect, useMemo } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEBUG } from '@/constants/debug';
import type { Session, User } from '@supabase/supabase-js';

export const [SupabaseAuthProvider, useSupabaseAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      if (DEBUG) console.log('[SupabaseAuth] Supabase not configured');
      return;
    }

    if (DEBUG) console.log('[SupabaseAuth] Restoring session...');
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
      if (DEBUG) console.log('[SupabaseAuth] Session restored:', currentSession ? 'authenticated' : 'none');
    }).catch(async (error) => {
      console.log('[SupabaseAuth] Error restoring session:', error);
      if (error?.message?.includes('Refresh Token') || error?.code === 'refresh_token_not_found') {
        console.log('[SupabaseAuth] Invalid refresh token, clearing session');
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.log('[SupabaseAuth] Forced sign out error:', signOutError);
        }
        setSession(null);
        setUser(null);
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (DEBUG) console.log('[SupabaseAuth] Auth state changed:', _event);
      if (_event === 'TOKEN_REFRESHED' && !newSession) {
        console.log('[SupabaseAuth] Token refresh failed, clearing session');
        try {
          await supabase.auth.signOut();
        } catch (e) {
          console.log('[SupabaseAuth] Sign out after failed refresh error:', e);
        }
        setSession(null);
        setUser(null);
        return;
      }
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return useMemo(() => ({
    session,
    user,
    isLoading,
    isAuthenticated: !!session,
  }), [session, user, isLoading]);
});
