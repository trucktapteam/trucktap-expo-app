import React from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RefreshCw, Store, Truck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';

export type ClientUpdateRequiredScreenProps = {
  paused: boolean;
  title: string;
  message: string;
  storeUrl: string | null;
  onRetry: () => void;
  onBrowseTrucks?: () => void;
  /**
   * 'screen' (default) fills the viewport via SafeAreaView, for a
   * dedicated route. 'inline' renders a bounded card suitable for
   * embedding inside a section of an otherwise-normal screen (e.g. a
   * profile card or a settings section) without taking over navigation.
   */
  variant?: 'screen' | 'inline';
};

// Shared visual/behavioral shell for every client-compatibility scope's
// blocking screen. Callers resolve scope-specific copy (paused vs.
// update-required title/message) and pass the result in; this component
// has no scope knowledge of its own.
export default function ClientUpdateRequiredScreen({
  paused,
  title,
  message,
  storeUrl,
  onRetry,
  onBrowseTrucks,
  variant = 'screen',
}: ClientUpdateRequiredScreenProps) {
  const handleUpdate = async () => {
    if (!storeUrl) {
      Alert.alert('Update unavailable', 'Please contact TruckTap support for the latest app link.');
      return;
    }
    const supported = await Linking.canOpenURL(storeUrl).catch(() => false);
    if (!supported) {
      Alert.alert('Unable to open store', 'Please update TruckTap directly from your app store.');
      return;
    }
    await Linking.openURL(storeUrl);
  };

  const content = (
    <View style={variant === 'inline' ? styles.inlineContainer : styles.container}>
      <View style={styles.iconWrap}>
        {paused ? <Truck size={42} color={Colors.primary} /> : <Store size={42} color={Colors.primary} />}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      {!paused && Platform.OS !== 'web' ? (
        <TouchableOpacity style={styles.primaryButton} onPress={() => void handleUpdate()}>
          <Store size={19} color={Colors.light} />
          <Text style={styles.primaryButtonText}>Update Now</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={styles.secondaryButton} onPress={onRetry}>
        <RefreshCw size={18} color={Colors.primary} />
        <Text style={styles.secondaryButtonText}>Try Again</Text>
      </TouchableOpacity>

      {onBrowseTrucks ? (
        <TouchableOpacity style={styles.browseButton} onPress={onBrowseTrucks}>
          <Text style={styles.browseButtonText}>Browse Trucks</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (variant === 'inline') {
    return content;
  }

  return <SafeAreaView style={styles.safeArea}>{content}</SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.light },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  inlineContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
    borderRadius: 16,
    backgroundColor: `${Colors.primary}08`,
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Colors.primary}16`,
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    color: Colors.dark,
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    color: Colors.gray,
    textAlign: 'center',
    marginBottom: 30,
  },
  primaryButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginBottom: 12,
  },
  primaryButtonText: { color: Colors.light, fontSize: 16, fontWeight: '800' },
  secondaryButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginBottom: 10,
  },
  secondaryButtonText: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  browseButton: { paddingHorizontal: 20, paddingVertical: 12 },
  browseButtonText: { color: Colors.gray, fontSize: 15, fontWeight: '700' },
});
