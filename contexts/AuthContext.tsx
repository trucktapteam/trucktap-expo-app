import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useMemo } from 'react';
import { Alert } from 'react-native';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEBUG } from '@/constants/debug';


type AuthUser = {
  id: string;
  email: string;
  name: string;
  provider: 'email' | 'google';
};

export const [AuthProvider, useAuth] = createContextHook(() => {
  const { user: supabaseUser, isLoading, isAuthenticated } = useSupabaseAuth();

  const user: AuthUser | null = useMemo(() => supabaseUser
    ? {
        id: supabaseUser?.id,
        email: supabaseUser.email ?? '',
        name:
          supabaseUser.user_metadata?.full_name ??
          supabaseUser.user_metadata?.name ??
          supabaseUser.email?.split('@')[0] ??
          'User',
        provider: (supabaseUser.app_metadata?.provider === 'google'
          ? 'google'
          : 'email') as 'email' | 'google',
      }
    : null, [supabaseUser]);

  useEffect(() => {
    if (DEBUG) console.log('[Auth] user:', user?.id, 'authenticated:', isAuthenticated);
  }, [supabaseUser?.id, user?.id, isAuthenticated]);

    const signInWithEmail = useCallback(async (email: string, password?: string) => {
    if (!isSupabaseConfigured) {
      Alert.alert('Error', 'Authentication is not configured. Please set up Supabase.');
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
  Alert.alert('Error', 'Please enter your email address.');
  return;
}

if (password !== undefined && password === '') {
  Alert.alert('Error', 'Please enter your password.');
  return;
}

    if (password) {
      if (DEBUG) console.log('[Auth] Signing in with email+password');
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInError) {
        if (signInError.message.includes('Invalid login credentials')) {
          if (DEBUG) console.log('[Auth] Invalid credentials, attempting sign up');
          const { error: signUpError } = await supabase.auth.signUp({
            email: trimmedEmail,
            password,
          });

          if (signUpError) {
            console.log('[Auth] Sign up error:', signUpError.message);
            Alert.alert('Error', signUpError.message);
            throw signUpError;
          }

          Alert.alert('Account Created', 'Check your email to confirm your account, then sign in.');
          return;
        }

        console.log('[Auth] Sign in error:', signInError.message);
        Alert.alert('Error', signInError.message);
        throw signInError;
      }

      if (DEBUG) console.log('[Auth] Signed in with email+password');
    } else {
      if (DEBUG) console.log('[Auth] Sending magic link');
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
      });

      if (error) {
        console.log('[Auth] OTP error:', error.message);
        Alert.alert('Error', error.message);
        throw error;
      }

      Alert.alert('Check Your Email', 'We sent you a magic link. Tap it to sign in.');
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      Alert.alert('Error', 'Authentication is not configured. Please set up Supabase.');
      return;
    }

    Alert.alert(
      'Google Sign In',
      'Google sign in is not available yet. Please use email and password to sign in.',
    );
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) {
      if (DEBUG) console.log('[Auth] Supabase not configured');
      return;
    }

    if (DEBUG) console.log('[Auth] Signing out');
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.log('[Auth] Sign out error:', error.message);
      throw error;
    }

  }, []);

  const requireAuth = useCallback(
    (callback: () => void): boolean => {
      if (isLoading) {
        if (DEBUG) console.log('[Auth] requireAuth blocked - loading');
        return false;
      }
      if (isAuthenticated && user) {
        callback();
        return true;
      }

      return false;
    },
    [isAuthenticated, user, isLoading],
  );

  return useMemo(() => ({
    user,
    isLoading,
    isAuthenticated,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    requireAuth,
  }), [user, isLoading, isAuthenticated, signInWithEmail, signInWithGoogle, signOut, requireAuth]);
});
