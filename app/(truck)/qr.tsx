import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import { Link2, AlertCircle, Share2, Download } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { DEBUG } from '@/constants/debug';
import QRCodeSVG from 'react-native-qrcode-svg';
import { getTruckShareUrl } from '@/lib/truckShare';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';

// react-native-view-shot cannot reliably screenshot react-native-svg content
// on Android (the SVG draws through its own native view, not the standard
// compositing path a view snapshot reads from), which produced blank
// exports. QRCodeSVG forwards `getRef` straight to the underlying
// react-native-svg <Svg> node, which has its own native toDataURL() that
// rasterizes the SVG's actual vector content directly (and internally waits
// for the view to finish rendering before resolving) - reliable on both
// platforms. A dedicated hidden instance renders at export resolution with
// a real quiet-zone margin so the on-screen QR (unchanged, no quiet zone,
// size 220) never has to change to serve the export.
const QR_EXPORT_PIXEL_SIZE = 1024;
const QR_EXPORT_QUIET_ZONE = 64;

export default function QRCodeScreen() {
  const { getUserTruck, isProfileComplete, markQrShared } = useApp();
  const truck = getUserTruck();
  useTruckLifecycleLogger('QRCodeScreen');
  const qrExportSvgRef = useRef<{ toDataURL: (callback: (data: string) => void, options?: { width: number; height: number }) => void } | null>(null);
  const [isSharingProfile, setIsSharingProfile] = useState(false);
  const [isExportingQr, setIsExportingQr] = useState(false);
  const isBusy = isSharingProfile || isExportingQr;

  const truckId = useMemo(() => {
    return truck?.id || '';
  }, [truck?.id]);

  const qrUrl = useMemo(() => {
    if (!truckId) {
      console.warn('⚠️ No truckId available for QR generation');
      return '';
    }
    const shareUrl = getTruckShareUrl(truckId);

    if (DEBUG) console.log('QR URL generated:', shareUrl, 'truckId:', truckId);

    return shareUrl;
  }, [truckId]);

  const profileUrl = useMemo(() => getTruckShareUrl(truckId), [truckId]);

  const profileComplete = useMemo(() => {
    return truck ? isProfileComplete(truck.id) : false;
  }, [truck, isProfileComplete]);



  const copyProfileLink = async () => {
    if (!truck) return;

    try {
      await Clipboard.setStringAsync(profileUrl);
      markQrShared();
      Alert.alert('Link Copied', 'Profile link copied to clipboard!');
    } catch (error) {
      console.error('Error copying link:', error);
      Alert.alert('Error', 'Could not copy link');
    }
  };

  const shareProfile = async () => {
    if (!truck) return;

    try {
      setIsSharingProfile(true);
      await Share.share({
        message: `Check out ${truck.name} on TruckTap! ${profileUrl}`,
        url: profileUrl,
        title: `${truck.name} - TruckTap`,
      });
      markQrShared();
    } catch (error) {
      console.error('Error sharing profile:', error);
      Alert.alert('Error', 'Could not share your profile link.');
    } finally {
      setIsSharingProfile(false);
    }
  };

  const exportAndShareQrCode = async () => {
    if (!truck || !qrUrl) return;

    if (Platform.OS === 'web') {
      Alert.alert('Not available on web', 'Saving or sharing the QR code image is available in the TruckTap mobile app.');
      return;
    }

    try {
      setIsExportingQr(true);

      if (!qrExportSvgRef.current) {
        throw new Error('QR code is not ready yet.');
      }

      const base64Png = await new Promise<string>((resolve, reject) => {
        qrExportSvgRef.current!.toDataURL(
          (data) => {
            if (data) {
              resolve(data);
            } else {
              reject(new Error('QR export returned no image data.'));
            }
          },
          { width: QR_EXPORT_PIXEL_SIZE, height: QR_EXPORT_PIXEL_SIZE }
        );
      });

      const fileUri = `${FileSystem.cacheDirectory}trucktap-qr-${truck.id}.png`;
      await FileSystem.writeAsStringAsync(fileUri, base64Png, { encoding: 'base64' });

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing unavailable', 'Sharing is not available on this device.');
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'image/png',
        dialogTitle: 'Save or Share Your QR Code',
      });
      markQrShared();
    } catch (error) {
      console.error('Error exporting QR code:', error);
      Alert.alert('Error', 'Could not export your QR code image.');
    } finally {
      setIsExportingQr(false);
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

        {qrUrl && (
          <View style={styles.hiddenExportQr} pointerEvents="none">
            <QRCodeSVG
              getRef={(ref) => {
                qrExportSvgRef.current = ref;
              }}
              value={qrUrl}
              size={QR_EXPORT_PIXEL_SIZE}
              quietZone={QR_EXPORT_QUIET_ZONE}
              backgroundColor="#ffffff"
              color="#000000"
            />
          </View>
        )}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={shareProfile}
            disabled={!truck || isBusy}
          >
            <Share2 size={20} color={Colors.light} />
            <Text style={styles.primaryButtonText}>
              {isSharingProfile ? 'Sharing...' : 'Share Profile'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={exportAndShareQrCode}
            disabled={!truck || !qrUrl || isBusy}
          >
            <Download size={20} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>
              {isExportingQr ? 'Preparing...' : 'Save or Share QR Code'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={copyProfileLink}
            disabled={!truck || isBusy}
          >
            <Link2 size={20} color={Colors.dark} />
            <Text style={styles.linkButtonText}>Copy Profile Link</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Put your TruckTap QR to work</Text>

          <Text style={styles.infoSectionLabel}>Customers who scan it can:</Text>
          <Text style={styles.infoBulletText}>
            • Open your TruckTap profile{'\n'}
            • See when you&apos;re LIVE{'\n'}
            • View your menu{'\n'}
            • See upcoming stops{'\n'}
            • Read reviews{'\n'}
            • Follow your truck
          </Text>

          <Text style={[styles.infoSectionLabel, styles.infoSectionLabelSpaced]}>Great places to use it</Text>
          <Text style={styles.infoBulletText}>
            • Serving window{'\n'}
            • Menu board{'\n'}
            • Business cards{'\n'}
            • Event banners{'\n'}
            • Table signs{'\n'}
            • Receipts{'\n'}
            • Social media posts{'\n'}
            • Website{'\n'}
            • Email signature
          </Text>

          <View style={styles.tipDivider} />
          <Text style={styles.tipText}>
            Tip: Ask customers to follow your truck so they can be notified when you go LIVE.
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
  hiddenExportQr: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
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
  infoCard: {
    backgroundColor: Colors.light,
    padding: 18,
    borderRadius: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 10,
  },
  infoSectionLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  infoSectionLabelSpaced: {
    marginTop: 12,
  },
  infoBulletText: {
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 19,
  },
  tipDivider: {
    height: 1,
    backgroundColor: Colors.lightGray,
    marginVertical: 12,
  },
  tipText: {
    fontSize: 13,
    color: Colors.dark,
    lineHeight: 19,
    fontStyle: 'italic' as const,
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
