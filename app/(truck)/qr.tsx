import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as Clipboard from 'expo-clipboard';

import { Link2, AlertCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { DEBUG } from '@/constants/debug';
import QRCodeSVG from 'react-native-qrcode-svg';


const FALLBACK_BASE_URL = 'https://trucktap.app';

function getBaseUrl(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const host = window.location.host;
      if (host.includes('localhost') || host.includes('127.0.0.1') || host.includes('192.168')) {
        return FALLBACK_BASE_URL;
      }
      return `${window.location.protocol}//${host}`;
    }
  }
  return FALLBACK_BASE_URL;
}

export default function QRCodeScreen() {
  const { getUserTruck, isProfileComplete, markQrShared } = useApp();
  const truck = getUserTruck();

  const truckId = useMemo(() => {
    return truck?.id || '';
  }, [truck?.id]);

  const qrUrl = useMemo(() => {
    if (!truckId) {
      console.warn('⚠️ No truckId available for QR generation');
      return '';
    }
    
    const baseUrl = getBaseUrl();
    const webUrl = `https://luxury-horse-2960dd.netlify.app/public/${truckId}`;
    
    if (DEBUG) console.log('QR URL generated:', webUrl, 'truckId:', truckId);
    
    return webUrl;
  }, [truckId]);

  const profileComplete = useMemo(() => {
    return truck ? isProfileComplete(truck.id) : false;
  }, [truck, isProfileComplete]);



  const copyProfileLink = async () => {
    if (!truck) return;

    try {
      await Clipboard.setStringAsync(qrUrl);
      markQrShared();
      Alert.alert('Link Copied', 'Profile link copied to clipboard!');
    } catch (error) {
      console.error('Error copying link:', error);
      Alert.alert('Error', 'Could not copy link');
    }
  };



  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Share Your Truck Profile</Text>
          <Text style={styles.subtitle}>
            Customers can scan this code to view your menu, posts, hours, reviews, and location.
          </Text>
        </View>

        {!truckId && (
          <View style={styles.errorBanner}>
            <AlertCircle size={20} color={Colors.danger} />
            <Text style={styles.errorText}>
              No truck ID found for this account. Cannot generate QR code.
            </Text>
          </View>
        )}

        {truck && !profileComplete && (
          <View style={styles.warningBanner}>
            <AlertCircle size={20} color={Colors.warning} />
            <Text style={styles.warningText}>
              Your profile is incomplete. Complete your menu, hours, and details for the best experience.
            </Text>
          </View>
        )}
          <View style={styles.qrContainer}>
  {qrUrl ? (
    <View
      style={{
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <QRCodeSVG value={qrUrl} size={220} />
    </View>
  ) : (
    <Text>No QR available</Text>
  )}
</View>
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={copyProfileLink}
            disabled={!truck}
          >
            <Link2 size={20} color={Colors.light} />
            <Text style={styles.primaryButtonText}>Copy Profile Link</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.instructionCard}>
          <Text style={styles.instructionText}>
            Share this link with customers so they can view your menu, hours, location, and reviews. You can also print QR codes and display them on your truck, menus, and social media.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightGray,
  },
  scrollContent: {
    padding: 20,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Colors.gray,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  qrContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
  },

  buttonContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: Colors.light,
    fontSize: 17,
    fontWeight: '700' as const,
  },
  secondaryButton: {
    backgroundColor: Colors.light,
    borderWidth: 2,
    borderColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  linkButton: {
    backgroundColor: Colors.light,
    borderWidth: 1.5,
    borderColor: Colors.gray,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  linkButtonText: {
    color: Colors.dark,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  instructionCard: {
    backgroundColor: Colors.light,
    padding: 24,
    borderRadius: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  instructionText: {
    fontSize: 15,
    color: Colors.gray,
    lineHeight: 22,
    textAlign: 'center',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: `${Colors.warning}15`,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    marginBottom: 20,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark,
    lineHeight: 20,
  },
  testModeCard: {
    backgroundColor: Colors.light,
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  testModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  testModeTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  testModeDescription: {
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 18,
    marginBottom: 12,
  },
  testModeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  testModeLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark,
  },
  qrInfoCard: {
    backgroundColor: Colors.light,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  qrInfoLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.gray,
    marginBottom: 6,
  },
  qrInfoUrl: {
    fontSize: 14,
    color: Colors.dark,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 12,
  },
  copyLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: `${Colors.primary}10`,
    borderRadius: 8,
  },
  copyLinkButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  testBadge: {
    backgroundColor: `${Colors.primary}10`,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  testBadgeText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: `${Colors.danger || '#FF3B30'}15`,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger || '#FF3B30',
    marginBottom: 20,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  debugInfo: {
    marginTop: 8,
  },
  debugLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.gray,
    marginBottom: 2,
  },
  debugValue: {
    fontSize: 12,
    color: Colors.dark,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  disabledButton: {
    backgroundColor: Colors.lightGray,
  },
  disabledButtonText: {
    color: Colors.gray,
  },
});
