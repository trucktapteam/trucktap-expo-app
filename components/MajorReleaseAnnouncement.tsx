import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, Sparkles, X } from 'lucide-react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACTIVE_MAJOR_RELEASE } from '@/constants/majorRelease';
import { useTheme } from '@/contexts/ThemeContext';
import {
  dismissMajorRelease,
  hasDismissedMajorRelease,
} from '@/lib/majorReleaseAnnouncement';

const MAIN_APP_ROUTES = new Set([
  '/dashboard',
  '/discover',
  '/favorites',
  '/full-map',
  '/profile',
]);

export default function MajorReleaseAnnouncement() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [shouldOffer, setShouldOffer] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  const release = ACTIVE_MAJOR_RELEASE;
  const copy = pathname === '/dashboard' ? release?.owner : release?.customer;

  React.useEffect(() => {
    let active = true;

    if (!release || !release.platforms.includes(Platform.OS as 'android' | 'ios')) {
      setShouldOffer(false);
      return () => {
        active = false;
      };
    }

    void hasDismissedMajorRelease(release.id)
      .then((dismissed) => {
        if (active) setShouldOffer(!dismissed);
      })
      .catch((error) => {
        // If storage is unavailable, stay quiet instead of showing the same
        // announcement on every launch.
        if (__DEV__) console.log('[MajorRelease] Unable to read dismissal:', error);
        if (active) setShouldOffer(false);
      });

    return () => {
      active = false;
    };
  }, [release]);

  React.useEffect(() => {
    if (!shouldOffer || !MAIN_APP_ROUTES.has(pathname)) {
      setVisible(false);
      return;
    }

    // Let startup routing finish before the informational card arrives.
    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, [pathname, shouldOffer]);

  if (!release || !copy || !visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    setShouldOffer(false);
    void dismissMajorRelease(release.id).catch((error) => {
      if (__DEV__) console.log('[MajorRelease] Unable to save dismissal:', error);
    });
  };

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View
        accessibilityViewIsModal={false}
        style={[
          styles.card,
          {
            top: insets.top + 10,
            backgroundColor: colors.cardBackground,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.headingRow}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
            <Sparkles size={22} color={colors.primary} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>{copy.eyebrow}</Text>
          <TouchableOpacity
            accessibilityLabel="Dismiss what's new"
            accessibilityRole="button"
            hitSlop={10}
            onPress={handleDismiss}
            style={styles.closeButton}
          >
            <X size={21} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
        <Text style={[styles.message, { color: colors.secondaryText }]}>{copy.message}</Text>

        <View style={styles.highlights}>
          {copy.highlights.map((highlight) => (
            <View key={highlight} style={styles.highlightRow}>
              <Check size={17} color={colors.primary} style={styles.check} />
              <Text style={[styles.highlightText, { color: colors.text }]}>{highlight}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={handleDismiss}
          style={[styles.dismissButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.dismissButtonText}>{copy.dismissLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignSelf: 'center',
    maxWidth: 520,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 10,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  eyebrow: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 14,
  },
  highlights: {
    gap: 9,
    marginBottom: 16,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  check: {
    marginRight: 9,
    marginTop: 2,
  },
  highlightText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  dismissButton: {
    minHeight: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
