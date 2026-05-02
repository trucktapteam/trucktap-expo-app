import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEBUG } from '@/constants/debug';
import type { Session, User } from '@supabase/supabase-js';

const devLogAuthClear = (
  functionName: string,
  reason: string,
  currentSession: Session | null,
  currentUser: User | null,
  extra?: unknown
) => {
  if (__DEV__) {
    console.log('[SupabaseAuth] Auth clear path:', {
      file: 'contexts/SupabaseAuthContext.tsx',
      functionName,
      reason,
      userId: currentUser?.id ?? null,
      email: currentUser?.email ?? null,
      sessionExists: !!currentSession,
      extra,
    });
  }
};

export const [SupabaseAuthProvider, useSupabaseAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured);
  const sessionRef = useRef<Session | null>(null);
  const userRef = useRef<User | null>(null);

  const applySession = useCallback((nextSession: Session | null) => {
    sessionRef.current = nextSession;
    userRef.current = nextSession?.user ?? null;
    setSession(nextSession);
    setUser(nextSession?.user ?? null);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      if (DEBUG) console.log('[SupabaseAuth] Supabase not configured');
      return;
    }

    if (DEBUG) console.log('[SupabaseAuth] Restoring session...');
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      applySession(currentSession);
      setIsLoading(false);
      if (DEBUG) console.log('[SupabaseAuth] Session restored:', currentSession ? 'authenticated' : 'none');
    }).catch((error) => {
      console.log('[SupabaseAuth] Error restoring session:', error);
      if (__DEV__) {
        console.log('[SupabaseAuth] Session restore failed without signing out:', {
          userId: userRef.current?.id ?? null,
          email: userRef.current?.email ?? null,
          sessionExists: !!sessionRef.current,
          error,
        });
      }
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (__DEV__) {
        console.log('[SupabaseAuth] Auth state changed:', {
          event: _event,
          hasNewSession: !!newSession,
          currentUserId: userRef.current?.id ?? null,
          newUserId: newSession?.user?.id ?? null,
        });
      }

      if (_event === 'SIGNED_OUT') {
        devLogAuthClear(
          'onAuthStateChange',
          'Supabase SIGNED_OUT event',
          sessionRef.current,
          userRef.current
        );
        applySession(null);
        setIsLoading(false);
        return;
      }

      if (newSession) {
        applySession(newSession);
        setIsLoading(false);
        return;
      }

      if (_event === 'TOKEN_REFRESHED') {
        if (__DEV__) {
          console.log('[SupabaseAuth] TOKEN_REFRESHED returned no session; keeping current auth state');
        }
        setIsLoading(false);
        return;
      }

      if (_event === 'INITIAL_SESSION') {
        if (sessionRef.current) {
          if (__DEV__) {
            console.log('[SupabaseAuth] INITIAL_SESSION returned no session after auth was already set; keeping current auth state');
          }
          setIsLoading(false);
          return;
        }

        applySession(null);
        setIsLoading(false);
        return;
      }

      if (__DEV__) {
        console.log('[SupabaseAuth] Ignoring null-session auth event:', _event);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [applySession]);

  return useMemo(() => ({
    session,
    user,
    isLoading,
    isAuthenticated: !!session,
  }), [session, user, isLoading]);
});
