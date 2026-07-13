import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';

type LocationPermissionCardProps = {
  visible: boolean;
  anim: Animated.Value;
  onAllow: () => void;
  onDismiss: () => void;
};

/**
 * TruckTap's shared, one-time "why we're asking for your location" card.
 * Used identically by Discover and Full Map via useLocationPermissionPrompt
 * so wording, layout, animation, and behavior never drift between screens.
 */
export default function LocationPermissionCard({
  visible,
  anim,
  onAllow,
  onDismiss,
}: LocationPermissionCardProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const styles = createStyles(colors);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: 64 + insets.bottom,
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [40, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <MapPin size={22} color={colors.primary} strokeWidth={2.2} />
        </View>
        <Text style={styles.title}>Let&apos;s get you fed!</Text>
        <Text style={styles.body}>
          Turn on your location and we&apos;ll show you what&apos;s cooking nearby.
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.allowButton}
            onPress={onAllow}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Allow Location"
            accessibilityHint="Turns on location so TruckTap can show food trucks near you"
          >
            <Text style={styles.allowText}>Allow Location</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.laterButton}
            onPress={onDismiss}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Maybe Later"
            accessibilityHint="Continues browsing without turning on location"
          >
            <Text style={styles.laterText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500' as const,
    color: colors.secondaryText,
    textAlign: 'center',
    marginBottom: 16,
  },
  actions: {
    width: '100%',
    gap: 8,
  },
  allowButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  allowText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.background,
  },
  laterButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  laterText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.secondaryText,
  },
});
