import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type UseAccountDeletionOptions = {
  source: string;
  onRequireAuth?: () => void;
};

export function useAccountDeletion({
  source,
  onRequireAuth,
}: UseAccountDeletionOptions) {
  const router = useRouter();
  const { logout } = useApp();
  const { isAuthenticated, user } = useAuth();
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const confirmationMessage =
    source === 'truck-settings'
      ? 'This permanently deletes your account, truck profile, truck location data, reviews tied to your truck, and related records. This cannot be undone.'
      : 'This permanently deletes your account, profile, favorites, reviews, and related records. This cannot be undone.';

  const performAccountDeletion = useCallback(async () => {
    if (isDeletingAccount) {
      console.log(`[DeleteAccountFlow:${source}] Already running`);
      return;
    }

    if (!isAuthenticated || !user) {
      console.log(`[DeleteAccountFlow:${source}] Not authenticated`);
      onRequireAuth?.();
      return;
    }

     if (!isSupabaseConfigured) {
      Alert.alert('Delete Account Unavailable', 'Supabase is not configured for this app.');
      return;
    }

    setIsDeletingAccount(true);
    console.log(`[DeleteAccountFlow:${source}] START`, user.id);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(sessionError.message || 'Could not read current session.');
      }

      if (!session?.access_token) {
        throw new Error('Missing access token for account-delete request.');
      }

      console.log(
        `[DeleteAccountFlow:${source}] Token preview:`,
        session.access_token.slice(0, 20)
      );

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

      if (!supabaseUrl) {
        throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/account-delete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });
    const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
  throw new Error(
    result?.error || `Account delete failed with status ${response.status}`
  );
}
      console.log(`[DeleteAccountFlow:${source}] Account deletion succeeded, logging out locally`);

      try {
         await logout();
      } catch (logoutError: any) {
        console.log(
          `[DeleteAccountFlow:${source}] Logout after delete failed:`,
          logoutError?.message ?? logoutError
        );
      }

       router.replace('/' as any);
    } catch (error: any) {
      const message = error?.message || 'Something went wrong deleting the account.';
      console.log(`[DeleteAccountFlow:${source}] ERROR:`, message, error);

      Alert.alert('Delete Account Failed', message);
     } finally {
      setIsDeletingAccount(false);
      console.log(`[DeleteAccountFlow:${source}] END`);
    }
  }, [
    isAuthenticated,
    isDeletingAccount,
    logout,
    onRequireAuth,
    router,
    source,
    user,
  ]);

  const confirmDeleteAccount = useCallback(() => {
    if (!isAuthenticated || !user) {
      console.log(`[DeleteAccountFlow:${source}] Confirmation blocked because user is not authenticated`);
      onRequireAuth?.();
      return;
    }

    console.log(`[DeleteAccountFlow:${source}] Showing confirmation alert for user:`, user.id);

    Alert.alert('Delete Account', confirmationMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Account',
        style: 'destructive',
        onPress: () => {
          console.log(`[DeleteAccountFlow:${source}] User confirmed account deletion`);
          void performAccountDeletion();
        },
      },
    ]);
  }, [confirmationMessage, isAuthenticated, onRequireAuth, performAccountDeletion, source, user]);

  return {
    isDeletingAccount,
    confirmDeleteAccount,
  };
 }