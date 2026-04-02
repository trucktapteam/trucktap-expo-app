import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Star } from 'lucide-react-native';
import Colors from '@/constants/colors';

type StatItemProps = {
  label: string;
  value: string | number;
  showStar?: boolean;
};

function StatItem({ label, value, showStar }: StatItemProps) {
  return (
    <View style={styles.statItem}>
      <View style={styles.valueRow}>
        {showStar && <Star size={18} color={Colors.starYellow} fill={Colors.starYellow} />}
        <Text style={[styles.value, showStar && styles.valueWithStar]}>{value}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

type StatsRowProps = {
  stats: {
    menuItems: number;
    rating: number;
  };
};

export default function StatsRow({ stats }: StatsRowProps) {
  return (
    <View style={styles.container}>
      <StatItem label="Menu Items" value={stats.menuItems} />
      <View style={styles.divider} />
      <StatItem label="Rating" value={stats.rating.toFixed(1)} showStar />
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
