import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Eye, Heart, Star, Phone, Navigation, Image as ImageIcon, ChevronLeft, Menu, TrendingUp } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp, useTruckRating } from '@/contexts/AppContext';

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

export default function AnalyticsDashboard() {
  const router = useRouter();
  const { getUserTruck, getTruckAnalytics } = useApp();
  const truck = getUserTruck();
  const analytics = getTruckAnalytics(truck?.id || '');
  const rating = useTruckRating(truck?.id || '');

  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

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
    { icon: Eye, label: 'Profile Views', value: analytics.views, color: Colors.primary, showTrend: true },
    { icon: Heart, label: 'Favorites', value: analytics.favorites, color: '#FF006E', showTrend: true },
    { icon: Star, label: 'Avg Rating', value: rating.average || 0, color: Colors.starYellow, showTrend: false },
    { icon: Menu, label: 'Menu Views', value: analytics.menuViews, color: '#8338EC', showTrend: true },
    { icon: Phone, label: 'Call Taps', value: analytics.calls, color: '#3A86FF', showTrend: true },
    { icon: Navigation, label: 'Navigate Taps', value: analytics.navigations, color: '#06D6A0', showTrend: true },
    { icon: ImageIcon, label: 'Photo Views', value: analytics.photoViews, color: '#FB5607', showTrend: true },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
          <ChevronLeft size={28} color={Colors.dark} />
        </TouchableOpacity>
        <Animated.View style={{ opacity: headerAnim }}>
          <Text style={styles.headerTitle}>Your Insights</Text>
          <Text style={styles.headerSubtitle}>Business analytics for {truck.name}</Text>
        </Animated.View>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
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
