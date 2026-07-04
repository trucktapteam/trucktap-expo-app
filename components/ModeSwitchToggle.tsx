import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LayoutDashboard, Search } from 'lucide-react-native';
import Colors from '@/constants/colors';

type ModeSwitchToggleProps = {
  mode: 'owner' | 'customer';
  onPress: () => void;
  compact?: boolean;
};

export default function ModeSwitchToggle({ mode, onPress, compact = false }: ModeSwitchToggleProps) {
  const isCustomerMode = mode === 'customer';

  return (
    <TouchableOpacity
      style={[styles.shell, compact && styles.shellCompact]}
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={isCustomerMode ? 'Open owner dashboard' : 'Open customer view'}
    >
      <View style={[styles.track, compact && styles.trackCompact]}>
        <View style={[styles.side, styles.ownerSide]}>
          <LayoutDashboard size={compact ? 11 : 12} color={isCustomerMode ? Colors.dark : '#fff'} />
          <Text
            style={[
              styles.label,
              styles.ownerLabel,
              !isCustomerMode && styles.activeLabel,
              compact && styles.compactLabel,
            ]}
            numberOfLines={1}
          >
            {compact ? 'Owner' : 'Owner'}
          </Text>
        </View>

        <View style={[styles.side, styles.customerSide]}>
          <Search size={compact ? 11 : 12} color={isCustomerMode ? '#fff' : '#15803D'} />
          <Text
            style={[
              styles.label,
              styles.customerLabel,
              isCustomerMode && styles.activeLabel,
              compact && styles.compactLabel,
            ]}
            numberOfLines={1}
          >
            {compact ? 'Customer' : 'Customer View'}
          </Text>
        </View>

        <View
          style={[
            styles.knob,
            compact && styles.knobCompact,
            isCustomerMode ? styles.knobCustomer : styles.knobOwner,
          ]}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    padding: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.58)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 2,
  },
  shellCompact: {},
  track: {
    width: 184,
    height: 32,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    position: 'relative',
  },
  trackCompact: {
    width: 132,
    height: 30,
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    zIndex: 2,
    paddingHorizontal: 8,
  },
  ownerSide: {
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
  },
  customerSide: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  label: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: Colors.dark,
  },
  compactLabel: {
    fontSize: 10,
  },
  ownerLabel: {
    color: Colors.dark,
  },
  customerLabel: {
    color: '#15803D',
  },
  activeLabel: {
    color: '#fff',
  },
  knob: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    width: 88,
    borderRadius: 999,
    backgroundColor: '#DDE3EA',
    borderWidth: 1,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#94A3B8',
    borderBottomColor: '#94A3B8',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 3,
    zIndex: 1,
  },
  knobCompact: {
    width: 63,
  },
  knobOwner: {
    left: 2,
    backgroundColor: Colors.primary,
  },
  knobCustomer: {
    right: 2,
    backgroundColor: '#16A34A',
  },
});
