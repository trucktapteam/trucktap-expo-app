import React, { useState, useCallback, useRef } from 'react';
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
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import QRCode from 'qrcode';
import { useRouter } from 'expo-router';
import { Download, Share2, Film, Video } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { PosterStyle, POSTER_STYLES } from '@/components/posters/PosterBase';
import BoldPoster from '@/components/posters/BoldPoster';
import MinimalPoster from '@/components/posters/MinimalPoster';
import NeonPoster from '@/components/posters/NeonPoster';
import GraffitiPoster from '@/components/posters/GraffitiPoster';
import AnimatedBoldPoster from '@/components/posters/animated/AnimatedBoldPoster';
import AnimatedMinimalPoster from '@/components/posters/animated/AnimatedMinimalPoster';
import AnimatedNeonPoster from '@/components/posters/animated/AnimatedNeonPoster';
import AnimatedGraffitiPoster from '@/components/posters/animated/AnimatedGraffitiPoster';
import { captureRef } from 'react-native-view-shot';
import { getTruckDeepLink, getTruckShareUrl } from '@/lib/truckShare';

export default function PosterScreen() {
  const { getUserTruck } = useApp();
  const router = useRouter();
  const truck = getUserTruck();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [selectedStyle, setSelectedStyle] = useState<PosterStyle>('bold');
  const [isAnimated, setIsAnimated] = useState<boolean>(false);
  const posterRef = useRef<View>(null);
  const animatedPosterRef = useRef<View>(null);

  const generateQRCode = useCallback(async () => {
    if (!truck) return;

    try {
      setIsGenerating(true);
      const deepLink = getTruckDeepLink(truck.id);
      const dataUrl = await QRCode.toDataURL(deepLink, {
        width: 600,
        margin: 1,
        color: {
          dark: '#111111',
          light: '#FFFFFF',
        },
      });
      setQrDataUrl(dataUrl);
    } catch (error) {
      console.error('Error generating QR code:', error);
      Alert.alert('Error', 'Could not generate QR code');
    } finally {
      setIsGenerating(false);
    }
  }, [truck]);

  React.useEffect(() => {
    generateQRCode();
  }, [generateQRCode]);

  const downloadPoster = async () => {
    if (!posterRef.current || !truck) return;

    try {
      setIsSaving(true);

      if (Platform.OS === 'web') {
        Alert.alert('Info', 'Download is available on mobile devices. Please use the share option on web.');
        return;
      }

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access to save poster');
        return;
      }

      const uri = await captureRef(posterRef, {
        format: 'png',
        quality: 1,
        width: 1080,
        height: 1920,
      });

      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync('TruckTap', asset, false);

      const styleName = POSTER_STYLES.find(s => s.value === selectedStyle)?.label || selectedStyle;
      Alert.alert('Success', `${styleName} poster saved to your photos!`);
    } catch (error) {
      console.error('Error saving poster:', error);
      Alert.alert('Error', 'Could not save poster to photos');
    } finally {
      setIsSaving(false);
    }
  };

  const sharePoster = async () => {
    if (!posterRef.current || !truck) return;

    try {
      setIsSaving(true);

      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({
            title: `${truck.name} - TruckTap`,
            text: `Check out ${truck.name} on TruckTap!`,
            url: getTruckShareUrl(truck.id),
          });
        } else {
          await navigator.clipboard.writeText(getTruckShareUrl(truck.id));
          Alert.alert('Link Copied', 'Profile link copied to clipboard!');
        }
        return;
      }

      const uri = await captureRef(posterRef, {
        format: 'png',
        quality: 1,
        width: 1080,
        height: 1920,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device');
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share Marketing Poster',
      });
    } catch (error) {
      console.error('Error sharing poster:', error);
      Alert.alert('Error', 'Could not share poster');
    } finally {
      setIsSaving(false);
    }
  };

  if (!truck) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Truck not found</Text>
          <Text style={styles.errorSubtitle}>No truck found to generate poster.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Marketing Poster</Text>
          <Text style={styles.subtitle}>
            Choose a style and create a shareable flyer
          </Text>
        </View>

        <View style={styles.styleSelector}>
          <Text style={styles.styleSelectorLabel}>Choose Style:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.styleButtons}
          >
            {POSTER_STYLES.map((style) => (
              <TouchableOpacity
                key={style.value}
                style={[
                  styles.styleButton,
                  selectedStyle === style.value && styles.styleButtonActive,
                ]}
                onPress={() => setSelectedStyle(style.value)}
              >
                <Text
                  style={[
                    styles.styleButtonText,
                    selectedStyle === style.value && styles.styleButtonTextActive,
                  ]}
                >
                  {style.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.styleDescription}>
            {POSTER_STYLES.find(s => s.value === selectedStyle)?.description}
          </Text>
        </View>

        <View style={styles.previewToggle}>
          <TouchableOpacity
            style={[styles.toggleButton, !isAnimated && styles.toggleButtonActive]}
            onPress={() => setIsAnimated(false)}
          >
            <Text style={[styles.toggleText, !isAnimated && styles.toggleTextActive]}>
              Static Preview
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, isAnimated && styles.toggleButtonActive]}
            onPress={() => setIsAnimated(true)}
          >
            <Text style={[styles.toggleText, isAnimated && styles.toggleTextActive]}>
              Animated Preview
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.posterWrapper}>
          {!isAnimated ? (
            <View ref={posterRef}>
              {isGenerating ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Generating QR Code...</Text>
                </View>
              ) : qrDataUrl && truck ? (
                <>
                  {selectedStyle === 'bold' && <BoldPoster truck={truck} qrDataUrl={qrDataUrl} />}
                  {selectedStyle === 'minimal' && <MinimalPoster truck={truck} qrDataUrl={qrDataUrl} />}
                  {selectedStyle === 'neon' && <NeonPoster truck={truck} qrDataUrl={qrDataUrl} />}
                  {selectedStyle === 'graffiti' && <GraffitiPoster truck={truck} qrDataUrl={qrDataUrl} />}
                </>
              ) : null}
            </View>
          ) : (
            <View ref={animatedPosterRef}>
              {isGenerating ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Generating QR Code...</Text>
                </View>
              ) : qrDataUrl && truck ? (
                <>
                  {selectedStyle === 'bold' && <AnimatedBoldPoster truck={truck} qrDataUrl={qrDataUrl} isPlaying={true} />}
                  {selectedStyle === 'minimal' && <AnimatedMinimalPoster truck={truck} qrDataUrl={qrDataUrl} isPlaying={true} />}
                  {selectedStyle === 'neon' && <AnimatedNeonPoster truck={truck} qrDataUrl={qrDataUrl} isPlaying={true} />}
                  {selectedStyle === 'graffiti' && <AnimatedGraffitiPoster truck={truck} qrDataUrl={qrDataUrl} isPlaying={true} />}
                </>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.exportOptions}>
          <Text style={styles.exportTitle}>Export Options:</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={downloadPoster}
            disabled={!qrDataUrl || isGenerating || isSaving || isAnimated}
          >
            <Download size={20} color={Colors.light} />
            <Text style={styles.primaryButtonText}>
              {isSaving ? 'Saving...' : 'Export Static Poster PNG'}
            </Text>
          </TouchableOpacity>

          {Platform.OS !== 'web' && (
            <TouchableOpacity
              style={[styles.primaryButton, isAnimated && styles.animatedExportButton]}
              onPress={() => Alert.alert('Not Available', 'Animated MP4 export requires the mobile app. Use screen recording as an alternative.')}
              disabled={!qrDataUrl || isGenerating || isSaving || !isAnimated}
            >
              <Film size={20} color={isAnimated ? Colors.light : Colors.gray} />
              <Text style={[styles.primaryButtonText, !isAnimated && styles.disabledButtonText]}>
                Export Animated Poster MP4
              </Text>
            </TouchableOpacity>
          )}

          {Platform.OS === 'web' && isAnimated && (
            <View style={styles.webMessage}>
              <Text style={styles.webMessageText}>
                Animated export is available on mobile through the TruckTap App.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={sharePoster}
            disabled={!qrDataUrl || isGenerating || isSaving || isAnimated}
          >
            <Share2 size={20} color={isAnimated ? Colors.gray : Colors.primary} />
            <Text style={[styles.secondaryButtonText, isAnimated && styles.disabledButtonText]}>
              Share Poster
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.promoVideoButton}
          onPress={() => router.push('/(truck)/poster-video' as any)}
        >
          <View style={styles.promoVideoIcon}>
            <Video size={24} color={Colors.primary} />
          </View>
          <View style={styles.promoVideoContent}>
            <Text style={styles.promoVideoTitle}>🎥 Create Promo Video</Text>
            <Text style={styles.promoVideoSubtitle}>
              Generate TikTok & Instagram Reels ready videos
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.instructionCard}>
          <Text style={styles.instructionTitle}>Marketing Ideas</Text>
          <Text style={styles.instructionText}>
            • Print and display on your truck window{'\n'}
            • Post on Instagram, Facebook, and TikTok{'\n'}
            • Share on your Instagram stories{'\n'}
            • Add to catering menus and flyers{'\n'}
            • Send to regular customers via text or email
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
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Colors.gray,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  styleSelector: {
    width: '100%',
    marginBottom: 24,
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 16,
  },
  styleSelectorLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 12,
  },
  styleButtons: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  styleButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.lightGray,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  styleButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  styleButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.gray,
  },
  styleButtonTextActive: {
    color: Colors.light,
  },
  styleDescription: {
    fontSize: 13,
    color: Colors.gray,
    marginTop: 12,
    lineHeight: 18,
  },
  posterWrapper: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  loadingContainer: {
    width: 340,
    height: 600,
    backgroundColor: Colors.lightGray,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.gray,
    fontWeight: '600' as const,
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
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: Colors.light,
    fontSize: 16,
    fontWeight: '600' as const,
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
  instructionCard: {
    backgroundColor: Colors.light,
    padding: 20,
    borderRadius: 16,
    width: '100%',
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 24,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    color: Colors.gray,
  },
  previewToggle: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: Colors.light,
    borderWidth: 2,
    borderColor: Colors.lightGray,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.gray,
  },
  toggleTextActive: {
    color: Colors.light,
  },
  exportOptions: {
    width: '100%',
    marginBottom: 12,
  },
  exportTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    textAlign: 'center',
  },
  animatedExportButton: {
    backgroundColor: Colors.primary,
  },
  disabledButtonText: {
    color: Colors.gray,
  },
  webMessage: {
    backgroundColor: Colors.light,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  webMessageText: {
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 20,
    textAlign: 'center',
  },
  promoVideoButton: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  promoVideoIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  promoVideoContent: {
    flex: 1,
  },
  promoVideoTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  promoVideoSubtitle: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 20,
  },
});
