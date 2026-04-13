import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type TruckClusterMarkerProps = {
  count: number;
};

export default function TruckClusterMarker({ count }: TruckClusterMarkerProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.bubble}>
        <Text style={styles.count}>{count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#f97316',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.24,
    shadowRadius: 6,
    elevation: 6,
  },
  count: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
});
