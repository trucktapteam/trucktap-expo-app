import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';

const LOGO = require('@/assets/images/icon.png');

export default function CustomerDiscoverHeader() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 4 }]}>
      <View style={styles.brandBlock}>
        <Text style={styles.title}>TruckTap</Text>
        <Text style={styles.subtitle}>Discover food trucks near you</Text>
      </View>

      <TouchableOpacity
        style={styles.profileButton}
        activeOpacity={0.8}
        onPress={() => router.push('/(customer)/(tabs)/profile' as any)}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
      >
        <Image source={LOGO} style={styles.profileImage} contentFit="contain" />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 8,
      backgroundColor: colors.background,
    },
    brandBlock: {
      flex: 1,
      paddingRight: 12,
    },
    title: {
      fontSize: 24,
      fontWeight: '700' as const,
      color: colors.text,
      lineHeight: 28,
    },
    subtitle: {
      fontSize: 13,
      color: colors.secondaryText,
      marginTop: 2,
    },
    profileButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.secondaryBackground,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    profileImage: {
      width: 24,
      height: 24,
    },
  });
