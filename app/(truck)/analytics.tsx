import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, Heart, Star, Navigation, Menu, TrendingUp, CheckCircle, Share2 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp, useTruckRating } from '@/contexts/AppContext';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type StatCardProps = {
  icon: React.ComponentType<any>;
  label: string;
  value: number;
  color: string;
  index: number;
  showTrend?: boolean;
};

function StatCard({ icon: Icon, label, value, color, index, showTrend }: StatCardProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        delay: index * 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim, index]);

  const isHighValue = value > 10;

  return (
    <Animated.View
      style={[
        styles.statCard,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
        <Icon size={24} color={color} />
      </View>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {showTrend && isHighValue && (
        <View style={styles.trendContainer}>
          <TrendingUp size={14} color={Colors.success} />
          <Text style={styles.trendText}>High</Text>
        </View>
      )}
    </Animated.View>
  );
}

type OwnerAnalyticsCounts = {
  profileViews: number;
  favorites: number;
  menuViews: number;
  navigateTaps: number;
  shares: number;
  checkInsThisMonth: number;
  customerCheckIns: number;
};

const EMPTY_ANALYTICS: OwnerAnalyticsCounts = {
  profileViews: 0,
  favorites: 0,
  menuViews: 0,
  navigateTaps: 0,
  shares: 0,
  checkInsThisMonth: 0,
  customerCheckIns: 0,
};

const getMonthStartDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-01`;
};

export default function AnalyticsDashboard() {
  const { getUserTruck } = useApp();
  const truck = getUserTruck();
  const rating = useTruckRating(truck?.id || '');
  const [analytics, setAnalytics] = useState<OwnerAnalyticsCounts>(EMPTY_ANALYTICS);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const headerAnim = useRef(new Animated.Value(0)).current;

  useTruckLifecycleLogger('AnalyticsDashboard');

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

  useEffect(() => {
    let cancelled = false;

    const fetchCount = async (
      table: 'analytics_events' | 'favorites' | 'truck_checkins',
      filters: (query: any) => any
    ) => {
      const query = filters(supabase.from(table).select('*', { count: 'exact', head: true }));
      const { count, error } = await query;

      if (error) {
        throw error;
      }

      return count ?? 0;
    };

    const fetchOwnerAnalytics = async () => {
      if (!truck?.id) {
        setAnalytics(EMPTY_ANALYTICS);
        setAnalyticsError(null);
        setAnalyticsLoading(false);
        return;
      }

      if (!isSupabaseConfigured) {
        setAnalytics(EMPTY_ANALYTICS);
        setAnalyticsError('Analytics are unavailable because Supabase is not configured.');
        setAnalyticsLoading(false);
        return;
      }

      setAnalyticsLoading(true);
      setAnalyticsError(null);

      try {
        const monthStart = getMonthStartDate();
        const [
          profileViews,
          navigateTaps,
          shares,
          menuViews,
          favorites,
          checkInsThisMonth,
          customerCheckIns,
        ] = await Promise.all([
          fetchCount('analytics_events', query =>
            query.eq('truck_id', truck.id).eq('event_type', 'truck_profile_view')
          ),
          fetchCount('analytics_events', query =>
            query.eq('truck_id', truck.id).eq('event_type', 'navigate_click')
          ),
          fetchCount('analytics_events', query =>
            query.eq('truck_id', truck.id).eq('event_type', 'share_click')
          ),
          fetchCount('analytics_events', query =>
            query.eq('truck_id', truck.id).eq('event_type', 'menu_view')
          ),
          fetchCount('favorites', query =>
            query.eq('truck_id', truck.id)
          ),
          fetchCount('truck_checkins', query =>
            query.eq('truck_id', truck.id).gte('checkin_date', monthStart)
          ),
          fetchCount('truck_checkins', query =>
            query.eq('truck_id', truck.id)
          ),
        ]);

        if (cancelled) return;

        setAnalytics({
          profileViews,
          favorites,
          menuViews,
          navigateTaps,
          shares,
          checkInsThisMonth,
          customerCheckIns,
        });
      } catch (error: any) {
        if (cancelled) return;

        const message = error?.message || 'Unable to load analytics. Your account may not have permission to read these analytics tables yet.';
        setAnalytics(EMPTY_ANALYTICS);
        setAnalyticsError(message);
        if (__DEV__) {
          console.log('[AnalyticsDashboard] Failed to load owner analytics:', error);
        }
      } finally {
        if (!cancelled) {
          setAnalyticsLoading(false);
        }
      }
    };

    void fetchOwnerAnalytics();

    return () => {
      cancelled = true;
    };
  }, [truck?.id]);

  if (!truck) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Truck not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stats = [
    { icon: Eye, label: 'Profile Views', value: analytics.profileViews, color: Colors.primary, showTrend: true },
    { icon: Heart, label: 'Favorites', value: analytics.favorites, color: '#FF006E', showTrend: true },
    { icon: Star, label: 'Avg Rating', value: rating.average || 0, color: Colors.starYellow, showTrend: false },
    { icon: Navigation, label: 'Navigate Taps', value: analytics.navigateTaps, color: '#06D6A0', showTrend: true },
    { icon: Share2, label: 'Shares', value: analytics.shares, color: '#3A86FF', showTrend: true },
    { icon: Menu, label: 'Menu Views', value: analytics.menuViews, color: '#8338EC', showTrend: true },
    { icon: CheckCircle, label: 'Check-Ins This Month', value: analytics.checkInsThisMonth, color: '#F97316', showTrend: true },
    { icon: CheckCircle, label: 'Customer Check-Ins', value: analytics.customerCheckIns, color: Colors.success, showTrend: true },
  ];
  const hasAnyRealActivity = stats.some(stat => stat.value > 0);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        <Animated.View style={[styles.screenIntro, { opacity: headerAnim }]}>
          <Text style={styles.headerSubtitle}>Business analytics for {truck.name}</Text>
        </Animated.View>

        {analyticsLoading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.statusText}>Loading analytics...</Text>
          </View>
        ) : null}

        {analyticsError ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Analytics unavailable</Text>
            <Text style={styles.statusText}>{analyticsError}</Text>
          </View>
        ) : null}

        {!analyticsLoading && !analyticsError && !hasAnyRealActivity ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>No analytics yet</Text>
            <Text style={styles.statusText}>Customer activity will appear here after people view, save, share, navigate to, or check in with your truck.</Text>
          </View>
        ) : null}

        <View style={styles.grid}>
          {stats.map((stat, index) => (
            <View key={stat.label} style={styles.gridItem}>
              <StatCard
                icon={stat.icon}
                label={stat.label}
                value={stat.value}
                color={stat.color}
                index={index}
                showTrend={stat.showTrend}
              />
            </View>
          ))}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📊 About Your Analytics</Text>
          <Text style={styles.infoText}>
            These metrics track customer interactions with your truck profile. Use them to understand what drives engagement and improve your business presence.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightGray,
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 15,
    color: Colors.gray,
    fontWeight: '500' as const,
  },
  screenIntro: {
    marginBottom: 16,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: Colors.gray,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    gap: 8,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  statusText: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  gridItem: {
    width: '50%',
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 160,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.gray,
    fontWeight: '600' as const,
    textAlign: 'center',
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: `${Colors.success}10`,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.success,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  infoTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 20,
  },
});
