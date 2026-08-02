import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { TruckSnapshotTile } from '@/lib/truckBusinessSnapshot';

export type BusinessSnapshotProps = {
  tiles: TruckSnapshotTile[];
};

export default function BusinessSnapshot({ tiles }: BusinessSnapshotProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <BarChart3 size={18} color={Colors.primary} />
        <Text style={styles.title}>Business Snapshot</Text>
      </View>
      <View style={styles.grid}>
        {tiles.map(tile => (
          <View key={tile.id} style={styles.tile}>
            <Text style={styles.tileValue}>{tile.value}</Text>
            <Text style={styles.tileLabel}>{tile.label}</Text>
            {tile.detail ? <Text style={styles.tileDetail}>{tile.detail}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light,
    padding: 15,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${Colors.primary}18`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 96,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  tileValue: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.dark,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.gray,
    marginTop: 2,
    textAlign: 'center',
  },
  tileDetail: {
    fontSize: 11,
    color: Colors.gray,
    marginTop: 2,
    textAlign: 'center',
  },
});
