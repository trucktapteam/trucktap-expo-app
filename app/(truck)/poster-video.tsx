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
import { useRouter } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import QRCode from 'qrcode';
import { Download, Share2, ArrowLeft, Play, Pause } from 'lucide-react-native';
import Slider from '@react-native-community/slider';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import PromoVideoTemplateA from '@/components/posters/video/PromoVideoTemplateA';
import PromoVideoTemplateB from '@/components/posters/video/PromoVideoTemplateB';
import PromoVideoTemplateC from '@/components/posters/video/PromoVideoTemplateC';
import { captureRef } from 'react-native-view-shot';
import { buildTruckPublicUrl } from '@/lib/truckShare';

type VideoTemplate = 'clean' | 'neon' | 'graffiti';

const VIDEO_TEMPLATES: { value: VideoTemplate; label: string; description: string }[] = [
  {
    value: 'clean',
    label: 'Clean Modern',
    description: 'Smooth gradients and floating effects - perfect for upscale trucks',
  },
  {
    value: 'neon',
    label: 'Neon Nightlife',
    description: 'Pulsing glows and neon effects - ideal for late-night trucks',
  },
  {
    value: 'graffiti',
    label: 'Graffiti Street',
    description: 'Paint splatters and street style - great for fusion & street food',
  },
];

export default function PosterVideoScreen() {
  const { getUserTruck } = useApp();
  const truck = getUserTruck();
  const router = useRouter();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [selectedTemplate, setSelectedTemplate] = useState<VideoTemplate>('clean');
  const [duration, setDuration] = useState<number>(8);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const videoRef = useRef<View>(null);

  const generateQRCode = useCallback(async () => {
    if (!truck) return;

    try {
      setIsGenerating(true);
      const deepLink = buildTruckPublicUrl(truck.id);
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

  const handleGenerateVideo = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Mobile Only',
        'Promo video export is available on mobile devices. Preview works on web, but export requires the TruckTap mobile app.'
      );
      return;
    }

    Alert.alert(
      'Export Video',
      'To export your promo video:\n\n• Use screen recording while the animation plays\n• Capture individual frames using the button below\n• Share the animated preview directly',
      [
        { text: 'OK', style: 'default' },
        {
          text: 'Preview Animation',
          onPress: () => setIsPlaying(true),
          style: 'default',
        },
      ]
    );
  };

  const captureFrame = async () => {
    if (!videoRef.current || !truck) return;

    try {
      setIsSaving(true);

      if (Platform.OS === 'web') {
        Alert.alert('Info', 'Frame capture is available on mobile devices');
        return;
      }

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access to save frame');
        return;
      }

      const uri = await captureRef(videoRef, {
        format: 'png',
        quality: 1,
        width: 1080,
        height: 1920,
      });

      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync('TruckTap', asset, false);

      Alert.alert('Success', 'Video frame saved to your photos!');
    } catch (error) {
      console.error('Error saving frame:', error);
      Alert.alert('Error', 'Could not save frame');
    } finally {
      setIsSaving(false);
    }
  };

  const shareFrame = async () => {
    if (!videoRef.current || !truck) return;

    try {
      setIsSaving(true);

      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({
            title: `${truck.name} - TruckTap Promo`,
            text: `Check out ${truck.name} on TruckTap!`,
            url: buildTruckPublicUrl(truck.id),
          });
        } else {
          await navigator.clipboard.writeText(buildTruckPublicUrl(truck.id));
          Alert.alert('Link Copied', 'Profile link copied to clipboard!');
        }
        return;
      }

      const uri = await captureRef(videoRef, {
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
        dialogTitle: 'Share Promo Video Frame',
      });
    } catch (error) {
      console.error('Error sharing frame:', error);
      Alert.alert('Error', 'Could not share frame');
    } finally {
      setIsSaving(false);
    }
  };

  if (!truck) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Truck not found</Text>
          <Text style={styles.errorSubtitle}>No truck found to generate promo video.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={Colors.dark} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Promo Video</Text>
          <Text style={styles.subtitle}>TikTok & Instagram Reels Ready</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.templateSelector}>
          <Text style={styles.selectorLabel}>Choose Video Style:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.templateButtons}
          >
            {VIDEO_TEMPLATES.map((template) => (
              <TouchableOpacity
                key={template.value}
                style={[
                  styles.templateButton,
                  selectedTemplate === template.value && styles.templateButtonActive,
                ]}
                onPress={() => setSelectedTemplate(template.value)}
              >
                <Text
                  style={[
                    styles.templateButtonText,
                    selectedTemplate === template.value && styles.templateButtonTextActive,
                  ]}
                >
                  {template.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.templateDescription}>
            {VIDEO_TEMPLATES.find(t => t.value === selectedTemplate)?.description}
          </Text>
        </View>

        <View style={styles.durationControl}>
          <Text style={styles.controlLabel}>Video Duration: {duration}s</Text>
          <Slider
            style={styles.slider}
            minimumValue={6}
            maximumValue={10}
            step={1}
            value={duration}
            onValueChange={setDuration}
            minimumTrackTintColor={Colors.primary}
            maximumTrackTintColor={Colors.lightGray}
            thumbTintColor={Colors.primary}
          />
        </View>

        <View style={styles.previewContainer}>
          <Text style={styles.previewLabel}>Preview:</Text>
          <View style={styles.videoWrapper}>
            <View ref={videoRef} style={styles.videoPreview}>
              {isGenerating ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Generating QR Code...</Text>
                </View>
              ) : qrDataUrl && truck ? (
                <>
                  {selectedTemplate === 'clean' && (
                    <PromoVideoTemplateA
                      truck={truck}
                      qrDataUrl={qrDataUrl}
                      isPlaying={isPlaying}
                      duration={duration}
                    />
                  )}
                  {selectedTemplate === 'neon' && (
                    <PromoVideoTemplateB
                      truck={truck}
                      qrDataUrl={qrDataUrl}
                      isPlaying={isPlaying}
                      duration={duration}
                    />
                  )}
                  {selectedTemplate === 'graffiti' && (
                    <PromoVideoTemplateC
                      truck={truck}
                      qrDataUrl={qrDataUrl}
                      isPlaying={isPlaying}
                      duration={duration}
                    />
                  )}
                </>
              ) : null}
            </View>
          </View>

          <View style={styles.playbackControls}>
            <TouchableOpacity
              style={styles.playButton}
              onPress={() => setIsPlaying(!isPlaying)}
              disabled={isGenerating}
            >
              {isPlaying ? (
                <Pause size={20} color={Colors.light} />
              ) : (
                <Play size={20} color={Colors.light} />
              )}
              <Text style={styles.playButtonText}>
                {isPlaying ? 'Pause Preview' : 'Play Preview'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.exportSection}>
          <Text style={styles.exportTitle}>Export Options:</Text>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.primaryButton, styles.comingSoonButton]}
            onPress={handleGenerateVideo}
            disabled={!qrDataUrl || isGenerating || isSaving}
          >
            <Download size={20} color={Colors.light} />
            <Text style={styles.primaryButtonText}>
              Generate Promo Video MP4
            </Text>
          </TouchableOpacity>

          {Platform.OS !== 'web' && (
            <>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={captureFrame}
                disabled={!qrDataUrl || isGenerating || isSaving}
              >
                <Download size={20} color={Colors.primary} />
                <Text style={styles.secondaryButtonText}>
                  {isSaving ? 'Saving...' : 'Save Current Frame'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={shareFrame}
                disabled={!qrDataUrl || isGenerating || isSaving}
              >
                <Share2 size={20} color={Colors.primary} />
                <Text style={styles.secondaryButtonText}>
                  Share Current Frame
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>💡 Pro Tips</Text>
          <Text style={styles.infoText}>
            • Use screen recording to capture the animation{'\n'}
            • Export frames and create a carousel post{'\n'}
            • Best for Instagram Reels & TikTok (9:16 ratio){'\n'}
            • Add trending audio in your video editing app{'\n'}
            • Tag @trucktap for a chance to be featured!
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.light,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    width: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 2,
  },
  scrollContent: {
    padding: 20,
  },
  templateSelector: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  selectorLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 12,
  },
  templateButtons: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  templateButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.lightGray,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  templateButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  templateButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.gray,
  },
  templateButtonTextActive: {
    color: Colors.light,
  },
  templateDescription: {
    fontSize: 13,
    color: Colors.gray,
    marginTop: 12,
    lineHeight: 18,
  },
  durationControl: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  controlLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  previewContainer: {
    marginBottom: 20,
  },
  previewLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 12,
  },
  videoWrapper: {
    alignItems: 'center',
    backgroundColor: Colors.light,
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  videoPreview: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.lightGray,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.gray,
    fontWeight: '600' as const,
  },
  playbackControls: {
    marginTop: 16,
    alignItems: 'center',
  },
  playButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  playButtonText: {
    color: Colors.light,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  exportSection: {
    marginBottom: 12,
  },
  exportTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    textAlign: 'center',
  },
  buttonContainer: {
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
  comingSoonButton: {
    backgroundColor: Colors.primary,
    opacity: 0.9,
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
  infoCard: {
    backgroundColor: Colors.light,
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 24,
  },
  comingSoonCard: {
    backgroundColor: '#F0F9FF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  comingSoonTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#1E40AF',
    marginBottom: 12,
  },
  comingSoonText: {
    fontSize: 14,
    color: '#1E40AF',
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
});
