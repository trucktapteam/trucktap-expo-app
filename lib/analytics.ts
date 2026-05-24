import { Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type AnalyticsMetadata = Record<string, unknown>;

type TrackEventInput = {
  event_type: string;
  truck_id?: string | null;
  metadata?: AnalyticsMetadata | null;
  user_id?: string | null;
};

const sessionId = `app-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function trackEvent({
  event_type,
  truck_id = null,
  metadata = null,
  user_id = null,
}: TrackEventInput): void {
  if (!isSupabaseConfigured) {
    return;
  }

  const logFailure = (error: unknown) => {
    if (__DEV__) {
      console.log('[Analytics] trackEvent failed:', {
        event_type,
        truck_id,
        error,
      });
    }
  };

  try {
    void supabase.from('analytics_events').insert({
      user_id: user_id ?? null,
      truck_id: truck_id ?? null,
      event_type,
      event_source: 'app',
      metadata: metadata ?? null,
      platform: Platform.OS,
      session_id: sessionId,
    }).then(({ error }) => {
      if (error) {
        logFailure(error);
      }
    }).catch(logFailure);
  } catch (error) {
    logFailure(error);
  }
}
