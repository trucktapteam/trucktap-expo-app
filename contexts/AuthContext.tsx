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

  const user: AuthUser | null = useMemo(
    () =>
      supabaseUser
        ? {
            id: supabaseUser.id,
            email: supabaseUser.email ?? '',
            name:
              supabaseUser.user_metadata?.full_name ??
              supabaseUser.user_metadata?.name ??
              supabaseUser.email?.split('@')[0] ??
              'User',
            provider:
              supabaseUser.app_metadata?.provider === 'google' ? 'google' : 'email',
          }
        : null,
    [supabaseUser]
  );

  useEffect(() => {
    if (DEBUG) {
      console.log('[Auth] user:', user?.id, 'authenticated:', isAuthenticated);
    }
  }, [user?.id, isAuthenticated]);

  const signInWithEmail = useCallback(async (email: string, password?: string) => {
    if (!isSupabaseConfigured) {
      Alert.alert('Error', 'Authentication is not configured. Please set up Supabase.');
      return false;
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      Alert.alert('Error', 'Please enter your email address.');
      return false;
    }

    if (password !== undefined && password === '') {
      Alert.alert('Error', 'Please enter your password.');
      return false;
    }

    if (password) {
      if (DEBUG) console.log('[Auth] Signing in with email+password');

      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        console.log('[Auth] Sign in error:', error.message);
        Alert.alert('Sign In Failed', error.message);
        throw error;
      }

      if (DEBUG) console.log('[Auth] Signed in with email+password');
      return true;
    }

    if (DEBUG) console.log('[Auth] Sending magic link');

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: 'rork-app://',
      },
    });

    if (error) {
      console.log('[Auth] OTP error:', error.message);
      Alert.alert('Error', error.message);
      throw error;
    }

    Alert.alert('Check Your Email', 'We sent you a magic link. Tap it to sign in.');
    return true;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      Alert.alert('Error', 'Authentication is not configured. Please set up Supabase.');
      return false;
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      Alert.alert('Error', 'Please enter your email address.');
      return false;
    }

    if (!password || password.trim() === '') {
      Alert.alert('Error', 'Please enter a password.');
      return false;
    }

    if (DEBUG) console.log('[Auth] Signing up with email+password');

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: 'rork-app://',
      },
    });

    if (error) {
      console.log('[Auth] Sign up error:', error.message);
      Alert.alert('Sign Up Failed', error.message);
      throw error;
    }

    if (DEBUG) {
      console.log('[Auth] Sign up response:', {
        userId: data.user?.id,
        hasSession: !!data.session,
      });
    }

    Alert.alert(
      'Account Created',
      'Check your email to confirm your account before signing in.'
    );

    return true;
  }, []);

  const resendConfirmationEmail = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) {
      Alert.alert('Error', 'Authentication is not configured. Please set up Supabase.');
      return false;
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      Alert.alert('Error', 'Missing email address.');
      return false;
    }

    if (DEBUG) console.log('[Auth] Resending confirmation email to:', trimmedEmail);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: trimmedEmail,
      options: {
        emailRedirectTo: 'rork-app://',
      },
    });

    if (error) {
      console.log('[Auth] Resend confirmation error:', error.message);
      Alert.alert('Resend Failed', error.message);
      return false;
    }

    Alert.alert(
      'Email Sent',
      'We sent you another confirmation email. Check your inbox and spam folder.'
    );

    return true;
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    if (!isSupabaseConfigured) {
      Alert.alert('Error', 'Authentication is not configured. Please set up Supabase.');
      return false;
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      Alert.alert('Error', 'Please enter your email address.');
      return false;
    }

    if (DEBUG) console.log('[Auth] Sending password reset email to:', trimmedEmail);

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: 'rork-app://',
    });

    if (error) {
      console.log('[Auth] Password reset error:', error.message);
      Alert.alert('Reset Failed', error.message);
      throw error;
    }

    Alert.alert(
      'Check Your Email',
      'We sent a password reset link. Open the email and follow the instructions to continue.'
    );

    return true;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!isSupabaseConfigured) {
      Alert.alert('Error', 'Authentication is not configured. Please set up Supabase.');
      return false;
    }

    if (!password || password.trim() === '') {
      Alert.alert('Error', 'Please enter a new password.');
      return false;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      console.log('[Auth] Update password error:', error.message);
      Alert.alert('Password Update Failed', error.message);
      throw error;
    }

    Alert.alert('Password Updated', 'Your password has been updated successfully.');
    return true;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      Alert.alert('Error', 'Authentication is not configured. Please set up Supabase.');
      return;
    }

    Alert.alert(
      'Google Sign In',
      'Google sign in is not available yet. Please use email and password to sign in.'
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
    [isAuthenticated, user, isLoading]
  );

  return useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated,
      signInWithEmail,
      signUpWithEmail,
      resendConfirmationEmail,
      resetPasswordForEmail,
      updatePassword,
      signInWithGoogle,
      signOut,
      requireAuth,
    }),
    [
      user,
      isLoading,
      isAuthenticated,
      signInWithEmail,
      signUpWithEmail,
      resendConfirmationEmail,
      resetPasswordForEmail,
      updatePassword,
      signInWithGoogle,
      signOut,
      requireAuth,
    ]
  );
   });
