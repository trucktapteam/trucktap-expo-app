import { supabase } from '@/lib/supabase';

/**
 * Best-effort: clears the push token for a user before their session ends,
 * so a signed-out device stops receiving that account's notifications.
 * Never throws — a failure here must not block or trap the user during sign-out.
 */
export const clearPushTokenForUser = async (userId: string | null | undefined): Promise<void> => {
  if (!userId) return;

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ push_token: null })
      .eq('id', userId);

    if (error && __DEV__) {
      console.log('[PushToken] Failed to clear push token on sign-out:', error.message);
    }
  } catch (error) {
    if (__DEV__) {
      console.log(
        '[PushToken] Failed to clear push token on sign-out:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
};
