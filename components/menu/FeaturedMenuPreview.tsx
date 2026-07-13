import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/contexts/ThemeContext';

type FeaturedMenuPreviewProps = {
  imageUrl: string;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
  onPress: () => void;
};

export default function FeaturedMenuPreview({
  imageUrl,
  title,
  subtitle,
  accessibilityLabel,
  onPress,
}: FeaturedMenuPreviewProps) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.imageWrap}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.backdrop}
          contentFit="cover"
          blurRadius={18}
        />
        <View style={styles.dimmer} />
        <Image source={{ uri: imageUrl }} style={styles.image} contentFit="contain" />
      </View>

      <View style={styles.footer}>
        <View style={styles.footerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <ChevronRight size={18} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors: Theme) => StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
  imageWrap: {
    position: 'relative',
    width: '100%',
    height: 214,
    overflow: 'hidden',
    backgroundColor: colors.secondaryBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.55,
    transform: [{ scale: 1.08 }],
  },
  dimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  footer: {
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
  },
  footerText: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700' as const,
    color: colors.text,
  },
  subtitle: {
    fontSize: 10,
    lineHeight: 12,
    color: colors.secondaryText,
  },
});
