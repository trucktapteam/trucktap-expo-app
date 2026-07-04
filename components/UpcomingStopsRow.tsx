import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { CalendarDays, Clock, MapPin } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { UpcomingStop, UpcomingStopStatus } from '@/types';

type UpcomingStopsRowProps = {
  stops: UpcomingStop[];
  onStopPress?: (stop: UpcomingStop) => void;
};

const statusLabels: Record<UpcomingStopStatus, string> = {
  scheduled: 'Scheduled',
  delayed: 'Delayed',
  cancelled: 'Cancelled',
  sold_out: 'Sold Out',
  completed: 'Completed',
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

const getStatusColor = (status: UpcomingStopStatus, colors: any) => {
  switch (status) {
    case 'delayed':
      return colors.warning;
    case 'cancelled':
      return colors.danger ?? colors.error;
    case 'sold_out':
      return colors.primary;
    default:
      return colors.success;
  }
};

export default function UpcomingStopsRow({ stops, onStopPress }: UpcomingStopsRowProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(260, Math.max(180, Math.floor((width - 44) / 1.95)));

  const visibleStops = useMemo(() => {
    const now = Date.now();

    return stops
      .filter(stop => stop.status !== 'completed')
      .filter(stop => {
        const endsAt = Date.parse(stop.ends_at);
        return Number.isFinite(endsAt) && endsAt > now;
      })
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  }, [stops]);

  if (visibleStops.length === 0) {
    return null;
  }

  const styles = createStyles(colors, cardWidth);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Where To Find Us Next</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {visibleStops.map((stop) => {
          const statusColor = getStatusColor(stop.status, colors);

          return (
            <TouchableOpacity
              key={stop.id}
              style={styles.card}
              onPress={() => onStopPress?.(stop)}
              activeOpacity={onStopPress ? 0.72 : 1}
              disabled={!onStopPress}
              accessibilityRole={onStopPress ? 'button' : undefined}
              accessibilityLabel={`View stop details for ${stop.location_text}`}
            >
              <View style={styles.locationRow}>
                <MapPin size={15} color={colors.primary} />
                <Text style={styles.locationText} numberOfLines={2}>{stop.location_text}</Text>
              </View>
              <View style={styles.dateRow}>
                <CalendarDays size={13} color={colors.secondaryText} />
                <Text style={styles.dateText}>{formatDate(stop.starts_at)}</Text>
              </View>
              <View style={styles.timeRow}>
                <Clock size={12} color={colors.secondaryText} />
                <Text style={styles.timeText}>
                  {formatTime(stop.starts_at)} - {formatTime(stop.ends_at)}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
                <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>
                  {statusLabels[stop.status]}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any, cardWidth: number) => StyleSheet.create({
  container: {
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 12,
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 2,
  },
  card: {
    width: cardWidth,
    minHeight: 118,
    backgroundColor: colors.secondaryBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 10,
  },
  locationText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 21,
    color: colors.text,
    fontWeight: '800' as const,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 5,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: colors.secondaryText,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  timeText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    fontWeight: '700' as const,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
  },
});
