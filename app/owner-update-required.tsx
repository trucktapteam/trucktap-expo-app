import React from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { RefreshCw, Store, Truck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useReleasePolicy } from '@/contexts/ReleasePolicyContext';
import { getClientRelease } from '@/lib/clientRelease';
import { getPolicyStoreUrl } from '@/lib/releasePolicyCore';

export default function OwnerUpdateRequiredScreen() {
  const router = useRouter();
  const { policy, ownerAccess, refresh } = useReleasePolicy();
  const release = React.useMemo(() => getClientRelease(), []);
  const storeUrl = getPolicyStoreUrl(policy, release.platform);
  const paused = ownerAccess === 'paused';

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          {paused ? <Truck size={42} color={Colors.primary} /> : <Store size={42} color={Colors.primary} />}
        </View>
        <Text style={styles.title}>
          {paused ? 'Truck management is temporarily paused' : policy.updateTitle}
        </Text>
        <Text style={styles.message}>
          {paused
            ? 'TruckTap is temporarily pausing owner-management actions. Customers can still browse and find trucks.'
            : policy.updateMessage}
        </Text>

        {!paused && Platform.OS !== 'web' ? (
          <TouchableOpacity style={styles.primaryButton} onPress={() => void handleUpdate()}>
            <Store size={19} color={Colors.light} />
            <Text style={styles.primaryButtonText}>Update Now</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.secondaryButton} onPress={() => void refresh()}>
          <RefreshCw size={18} color={Colors.primary} />
          <Text style={styles.secondaryButtonText}>Try Again</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.browseButton}
          onPress={() => router.replace('/(customer)/(tabs)/discover' as any)}
        >
          <Text style={styles.browseButtonText}>Browse Trucks</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.light },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
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
