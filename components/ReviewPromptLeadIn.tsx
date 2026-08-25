import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { registerReviewLeadInPresenter } from '@/lib/appReviewPrompt';

export default function ReviewPromptLeadIn() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [respond, setRespond] = React.useState<((accepted: boolean) => void) | null>(null);

  React.useEffect(() => {
    return registerReviewLeadInPresenter((respondFn) => {
      setRespond(() => respondFn);
    });
  }, []);

  if (!respond) return null;

  const handleChoice = (accepted: boolean) => {
    const resolve = respond;
    setRespond(null);
    resolve(accepted);
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
            <Star size={22} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>WELL&hellip; DID WE EARN IT?</Text>
        </View>

        <Text style={[styles.message, { color: colors.secondaryText }]}>
          If TruckTap has been useful, we&rsquo;d appreciate a quick rating. It helps more hungry
          people and food trucks find us.
        </Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => handleChoice(false)}
            style={styles.laterButton}
          >
            <Text style={[styles.laterButtonText, { color: colors.secondaryText }]}>Maybe later</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => handleChoice(true)}
            style={[styles.rateButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.rateButtonText}>Rate TruckTap</Text>
          </TouchableOpacity>
        </View>
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
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  laterButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  rateButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
