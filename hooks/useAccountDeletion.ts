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

export function useAccountDeletion({ source, onRequireAuth }: UseAccountDeletionOptions) {
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
      console.log(`[DeleteAccountFlow:${source}] Already deleting account, ignoring duplicate tap`);
      return;
    }

    if (!isAuthenticated || !user) {
      console.log(`[DeleteAccountFlow:${source}] Deletion blocked because user is not authenticated`);
      onRequireAuth?.();
      return;
    }

    if (!isSupabaseConfigured) {
      console.log(`[DeleteAccountFlow:${source}] Supabase is not configured`);
      Alert.alert('Delete Account Unavailable', 'Supabase is not configured for this app.');
      return;
    }

    setIsDeletingAccount(true);
    console.log(`[DeleteAccountFlow:${source}] Starting account-delete flow for user:`, user.id);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(sessionError.message || 'Could not read the current session.');
      }

      if (!session?.access_token) {
        throw new Error('Missing access token for account-delete request.');
      }

      console.log(`[DeleteAccountFlow:${source}] Invoking account-delete edge function`);
      const { data, error } = await supabase.functions.invoke('account-delete', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log(`[DeleteAccountFlow:${source}] Edge function response:`, {
        hasData: !!data,
        error: error?.message ?? null,
        data,
      });

      if (error) {
        throw new Error(error.message || 'Account deletion failed.');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Account deletion did not complete successfully.');
      }

      console.log(`[DeleteAccountFlow:${source}] Server-side deletion succeeded, signing user out locally`);
      try {
        await logout();
        console.log(`[DeleteAccountFlow:${source}] Local logout complete`);
      } catch (logoutError: any) {
        console.log(
          `[DeleteAccountFlow:${source}] Local logout failed after deletion, continuing to redirect:`,
          logoutError?.message ?? logoutError
        );
      }

      console.log(`[DeleteAccountFlow:${source}] Routing to logged-out screen`);
      router.replace('/' as any);
    } catch (error: any) {
      const message = error?.message ?? 'Failed to delete account.';
      console.log(`[DeleteAccountFlow:${source}] Account deletion failed:`, message, error);

      const deployHint = message.toLowerCase().includes('function')
        ? ' If this is a new build, make sure the Supabase account-delete edge function is deployed.'
        : '';

      Alert.alert(
        'Delete Account Failed',
        `We could not delete this account right now.\n\n${message}${deployHint}`
      );
    } finally {
      console.log(`[DeleteAccountFlow:${source}] Account-delete flow finished`);
      setIsDeletingAccount(false);
    }
  }, [isAuthenticated, isDeletingAccount, logout, onRequireAuth, router, source, user]);

  const confirmDeleteAccount = useCallback(() => {
    if (!isAuthenticated || !user) {
      console.log(`[DeleteAccountFlow:${source}] Confirmation blocked because user is not authenticated`);
      onRequireAuth?.();
      return;
    }

    console.log(`[DeleteAccountFlow:${source}] Showing confirmation alert for user:`, user.id);
    Alert.alert(
      'Delete Account',
      confirmationMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            console.log(`[DeleteAccountFlow:${source}] User confirmed account deletion`);
            void performAccountDeletion();
          },
        },
      ]
    );
  }, [confirmationMessage, isAuthenticated, onRequireAuth, performAccountDeletion, source, user]);

  return {
    isDeletingAccount,
    confirmDeleteAccount,
  };
}
