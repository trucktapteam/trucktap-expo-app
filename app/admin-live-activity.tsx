import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type LiveEventAction = 'go_live' | 'go_offline';

type TruckLiveEventRow = {
  id: string;
  action: LiveEventAction;
  source: string;
  location_label: string | null;
  created_at: string;
  trucks: { name: string | null } | { name: string | null }[] | null;
};

type LiveActivityItem = {
  id: string;
  action: LiveEventAction;
  source: string;
  truckName: string;
  locationLabel?: string;
  createdAt: string;
};

const formatSourceLabel = (source: string): string => {
  switch (source) {
    case 'manual':
      return 'Manual';
    case 'expiration':
      return 'Auto Expired';
    case 'archive':
      return 'Archived';
    case 'schedule':
      return 'Scheduled';
    case 'nudge_confirmation':
      return 'Still Open Check';
    default:
      return source
        .split('_')
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || 'Unknown';
  }
};

const formatEventTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getTruckName = (row: TruckLiveEventRow): string => {
  const truck = Array.isArray(row.trucks) ? row.trucks[0] : row.trucks;
  return truck?.name?.trim() || 'Unnamed truck';
};

export default function AdminLiveActivityScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isLoading: authLoading } = useAuth();
  const { currentUser } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const [events, setEvents] = useState<LiveActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !currentUser) return;
    if (!isAdmin) {
      router.replace('/truck-login' as any);
    }
  }, [authLoading, currentUser, isAdmin, router]);

  const loadEvents = useCallback(async (refreshing = false) => {
    if (!isAdmin) {
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMessage('LIVE activity is unavailable because Supabase is not configured.');
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setErrorMessage(null);

    const { data, error } = await supabase
      .from('truck_live_events')
      .select('id, action, source, location_label, created_at, trucks(name)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.log('[AdminLiveActivity] Failed to load live events:', error.message);
      setErrorMessage('Could not load LIVE activity.');
      setEvents([]);
    } else {
      const rows = (data ?? []) as TruckLiveEventRow[];
      setEvents(rows.map(row => ({
        id: row.id,
        action: row.action,
        source: row.source,
        truckName: getTruckName(row),
        locationLabel: row.location_label?.trim() || undefined,
        createdAt: row.created_at,
      })));
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [isAdmin]);

  useEffect(() => {
    if (!authLoading && currentUser && isAdmin) {
      void loadEvents();
    }
  }, [authLoading, currentUser, isAdmin, loadEvents]);

  if (authLoading || !currentUser || !isAdmin) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadEvents(true)}
              tintColor={colors.primary}
            />
          }
        >
          {errorMessage ? (
            <View style={[styles.stateCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Text style={[styles.stateText, { color: colors.error }]}>{errorMessage}</Text>
            </View>
          ) : null}

          {!errorMessage && events.length === 0 ? (
            <View style={[styles.stateCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Text style={[styles.stateText, { color: colors.secondaryText }]}>No LIVE activity recorded yet.</Text>
            </View>
          ) : null}

          <View style={styles.feed}>
            {events.map(event => {
              const opened = event.action === 'go_live';
              const actionLabel = opened ? 'Opened' : 'Closed';
              const actionColor = opened ? colors.success : colors.error;

              return (
                <View
                  key={event.id}
                  style={[styles.eventCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                >
                  <View style={styles.eventHeader}>
                    <Text style={[styles.actionText, { color: actionColor }]}>
                      {opened ? '🟢' : '🔴'} {actionLabel}
                    </Text>
                    <Text style={[styles.timeText, { color: colors.secondaryText }]}>
                      {formatEventTime(event.createdAt)}
                    </Text>
                  </View>
                  <Text style={[styles.truckName, { color: colors.text }]}>{event.truckName}</Text>
                  <Text style={[styles.metaText, { color: colors.secondaryText }]}>
                    Source: {formatSourceLabel(event.source)}
                  </Text>
                  {event.locationLabel ? (
                    <Text style={[styles.metaText, { color: colors.secondaryText }]} numberOfLines={2}>
                      Location: {event.locationLabel}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  feed: {
    gap: 12,
  },
  eventCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '800' as const,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  truckName: {
    fontSize: 17,
    fontWeight: '800' as const,
    marginBottom: 6,
  },
  metaText: {
    fontSize: 13,
    lineHeight: 18,
  },
  stateCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
  },
  stateText: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600' as const,
  },
});
