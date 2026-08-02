import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PartyPopper } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { TruckWin } from '@/lib/truckWins';

export type WinsProps = {
  wins: TruckWin[];
};

export default function Wins({ wins }: WinsProps) {
  if (wins.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <PartyPopper size={18} color={Colors.success} />
        <Text style={styles.title}>Wins</Text>
      </View>
      <View style={styles.list}>
        {wins.map(win => (
          <Text key={win.id} style={styles.winText}>{win.message}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: `${Colors.success}0D`,
    padding: 15,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${Colors.success}25`,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.dark,
  },
  list: {
    gap: 6,
  },
  winText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600' as const,
    color: Colors.dark,
  },
});
