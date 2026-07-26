import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Star } from 'lucide-react-native';
import Colors from '@/constants/colors';

type StatsRowProps = {
  stats: {
    reviewsCount: number;
    rating: number;
  };
  onReviewsPress: () => void;
};

export default function StatsRow({ stats, onReviewsPress }: StatsRowProps) {
  const hasReviews = stats.reviewsCount > 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.statItem}
        onPress={onReviewsPress}
        activeOpacity={0.7}
      >
        <View style={styles.valueRow}>
          <Text style={[styles.value, !hasReviews && styles.noReviewsValue]}>
            {hasReviews ? stats.reviewsCount : 'No Reviews Yet'}
          </Text>
        </View>
        <Text style={styles.label}>{hasReviews ? 'View & Reply →' : 'Tap to View'}</Text>
      </TouchableOpacity>
      <View style={styles.divider} />
      <View style={styles.statItem}>
        <View style={styles.valueRow}>
          <Star size={18} color={Colors.starYellow} fill={Colors.starYellow} />
          <Text style={[styles.value, styles.valueWithStar]}>{stats.rating.toFixed(1)}</Text>
        </View>
        <Text style={styles.label}>Rating</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  value: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  valueWithStar: {
    marginLeft: 4,
  },
  noReviewsValue: {
    fontSize: 16,
  },
  label: {
    fontSize: 12,
    color: Colors.gray,
    fontWeight: '500' as const,
  },
  divider: {
    width: 1,
    backgroundColor: Colors.lightGray,
    marginHorizontal: 12,
  },
});
