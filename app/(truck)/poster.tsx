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
import { Download, Share2 } from 'lucide-react-native';
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
import { getTruckShareUrl } from '@/lib/truckShare';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';
import QRCodeDataUrlGenerator from '@/components/qr/QRCodeDataUrlGenerator';

export default function PosterScreen() {
  const { getUserTruck } = useApp();
  const truck = getUserTruck();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(true);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrGenerationAttempt, setQrGenerationAttempt] = useState(0);
  const [activeAction, setActiveAction] = useState<'export' | 'share' | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<PosterStyle>('bold');
  const [isAnimated, setIsAnimated] = useState<boolean>(false);
  const posterRef = useRef<View>(null);
  const animatedPosterRef = useRef<View>(null);
  const actionInProgressRef = useRef(false);
  useTruckLifecycleLogger('PosterScreen');

  const handleQrGenerated = useCallback((dataUrl: string) => {
    setQrDataUrl(dataUrl);
    setQrError(null);
    setIsGenerating(false);
  }, []);

  const handleQrError = useCallback((error: Error) => {
    console.error('Error generating poster QR code:', error);
    setQrDataUrl('');
    setQrError('Could not generate the poster QR code. Please try again.');
    setIsGenerating(false);
    Alert.alert('QR Code Error', 'Could not generate the poster QR code. Please try again.');
  }, []);

  const retryQrGeneration = () => {
    setQrDataUrl('');
    setQrError(null);
    setIsGenerating(true);
    setQrGenerationAttempt(current => current + 1);
  };

  const captureStaticPoster = async () => {
    if (isAnimated) {
      throw new Error('Select Static Preview before exporting or sharing your poster.');
    }
    if (isGenerating || !qrDataUrl) {
      throw new Error('Wait for the static poster preview to finish rendering, then try again.');
    }

    const captureTarget = posterRef.current;
    if (!captureTarget) {
      throw new Error('The static poster preview is not ready yet. Please try again.');
    }

    const uri = await captureRef(captureTarget, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });

    if (!uri) {
      throw new Error('The poster image could not be created. Please try again.');
    }

    return uri;
  };

  const beginAction = (action: 'export' | 'share') => {
    if (actionInProgressRef.current) return false;
    actionInProgressRef.current = true;
    setActiveAction(action);
    return true;
  };

  const finishAction = () => {
    actionInProgressRef.current = false;
    setActiveAction(null);
  };

  const downloadPoster = async () => {
    if (!beginAction('export')) return;

    try {
      if (!truck) {
        throw new Error('Your truck information is not available. Please reopen this page and try again.');
      }

      if (Platform.OS === 'web') {
        Alert.alert('Info', 'Download is available on mobile devices. Please use the share option on web.');
        return;
      }

      const uri = await captureStaticPoster();
      await MediaLibrary.saveToLibraryAsync(uri);

      const styleName = POSTER_STYLES.find(s => s.value === selectedStyle)?.label || selectedStyle;
      Alert.alert('Success', `${styleName} poster saved to your photos!`);
    } catch (error) {
      console.error('Error saving poster:', error);
      const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
      Alert.alert('Could Not Save Poster', message);
    } finally {
      finishAction();
    }
  };

  const sharePoster = async () => {
    if (!beginAction('share')) return;

    try {
      if (!truck) {
        throw new Error('Your truck information is not available. Please reopen this page and try again.');
      }

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

      const uri = await captureStaticPoster();

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Sharing is not available on this device.');
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share Marketing Poster',
        UTI: 'public.png',
      });
    } catch (error) {
      console.error('Error sharing poster:', error);
      const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
      Alert.alert('Could Not Share Poster', message);
    } finally {
      finishAction();
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
      <QRCodeDataUrlGenerator
        key={`${truck.id}-${qrGenerationAttempt}`}
        value={getTruckShareUrl(truck.id)}
        size={600}
        onGenerated={handleQrGenerated}
        onError={handleQrError}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
            <View ref={posterRef} style={styles.captureTarget} collapsable={false}>
              {isGenerating ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Generating QR Code...</Text>
                </View>
              ) : qrError ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.qrErrorText}>{qrError}</Text>
                  <TouchableOpacity onPress={retryQrGeneration} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>Try Again</Text>
                  </TouchableOpacity>
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
            <View ref={animatedPosterRef} style={styles.captureTarget} collapsable={false}>
              {isGenerating ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Generating QR Code...</Text>
                </View>
              ) : qrError ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.qrErrorText}>{qrError}</Text>
                  <TouchableOpacity onPress={retryQrGeneration} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>Try Again</Text>
                  </TouchableOpacity>
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
            disabled={activeAction !== null}
          >
            <Download size={20} color={Colors.light} />
            <Text style={styles.primaryButtonText}>
              {activeAction === 'export' ? 'Saving...' : 'Export Static Poster PNG'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={sharePoster}
            disabled={activeAction !== null}
          >
            <Share2 size={20} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>
              {activeAction === 'share' ? 'Opening Share Sheet...' : 'Share Poster'}
            </Text>
          </TouchableOpacity>
        </View>

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
  captureTarget: {
    width: 340,
    alignItems: 'center',
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
  qrErrorText: {
    maxWidth: 270,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.danger,
    fontWeight: '600' as const,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  retryButtonText: {
    color: Colors.light,
    fontSize: 14,
    fontWeight: '700' as const,
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
});
