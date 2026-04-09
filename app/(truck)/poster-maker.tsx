import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import QRCode from 'qrcode';
import { Download, Share2, Palette } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import PosterRenderer from '@/components/posters/PosterRenderer';
import type { PosterTemplate, PosterConfig } from '@/types/poster';
import { buildTruckPublicUrl } from '@/lib/truckShare';

const TEMPLATES: { id: PosterTemplate; label: string; description: string }[] = [
  { id: 'simple', label: 'Simple', description: 'Clean white background, centered QR' },
  { id: 'modern', label: 'Modern', description: 'Rounded card, truck photo at top' },
  { id: 'bold', label: 'Bold', description: 'Full-color background, glowing QR' },
];

const COLOR_OPTIONS = [
  { label: 'Orange', value: Colors.primary },
  { label: 'Red', value: '#E53E3E' },
  { label: 'Blue', value: '#3182CE' },
  { label: 'Green', value: '#38A169' },
  { label: 'Purple', value: '#805AD5' },
  { label: 'Pink', value: '#D53F8C' },
];

export default function PosterMaker() {
  const { getUserTruck } = useApp();
  const truck = getUserTruck();
  const posterRef = useRef<View>(null);

  const [config, setConfig] = useState<PosterConfig>({
    template: 'simple',
    slogan: 'Scan to see our menu!',
    backgroundColor: Colors.primary,
    showPhoto: true,
  });

  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGeneratingQR, setIsGeneratingQR] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  React.useEffect(() => {
    if (!truck) return;

    const generateQR = async () => {
      try {
        setIsGeneratingQR(true);
        const url = buildTruckPublicUrl(truck.id);
        const dataUrl = await QRCode.toDataURL(url, {
          width: 800,
          margin: 2,
          errorCorrectionLevel: 'M',
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
        setIsGeneratingQR(false);
      }
    };

    generateQR();
  }, [truck]);

  const handleExport = async () => {
    if (!posterRef.current || !truck) return;

    try {
      setIsExporting(true);

      const uri = await captureRef(posterRef, {
        format: 'png',
        quality: 1,
        width: 1080,
        height: 1920,
      });

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = `poster-${truck.name.replace(/\s+/g, '-').toLowerCase()}.png`;
        link.click();
        Alert.alert('Success', 'Poster downloaded!');
        return;
      }

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access to save poster');
        return;
      }

      const asset = await MediaLibrary.createAssetAsync(uri);
      await MediaLibrary.createAlbumAsync('TruckTap', asset, false);

      Alert.alert('Success', 'Poster saved to your photos!');
    } catch (error) {
      console.error('Error exporting poster:', error);
      Alert.alert('Error', 'Could not save poster');
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    if (!posterRef.current || !truck) return;

    try {
      setIsExporting(true);

      const uri = await captureRef(posterRef, {
        format: 'png',
        quality: 1,
        width: 1080,
        height: 1920,
      });

      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({
            title: `${truck.name} Poster`,
            text: `Check out ${truck.name} on TruckTap!`,
            url: buildTruckPublicUrl(truck.id),
          });
        } else {
          await navigator.clipboard.writeText(buildTruckPublicUrl(truck.id));
          Alert.alert('Link Copied', 'Profile link copied to clipboard!');
        }
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device');
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share Poster',
      });
    } catch (error) {
      console.error('Error sharing poster:', error);
      Alert.alert('Error', 'Could not share poster');
    } finally {
      setIsExporting(false);
    }
  };

  if (!truck) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Marketing Poster' }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Truck not found</Text>
          <Text style={styles.errorSubtitle}>Please complete your setup.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isGeneratingQR) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: 'Marketing Poster' }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorSubtitle}>Generating poster...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Marketing Poster' }} />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.header}>
          <Text style={styles.title}>Create Marketing Poster</Text>
          <Text style={styles.subtitle}>
            Design a shareable poster for social media, printing, or your truck window
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Template</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.templateList}
          >
            {TEMPLATES.map((template) => (
              <TouchableOpacity
                key={template.id}
                style={[
                  styles.templateCard,
                  config.template === template.id && styles.templateCardActive,
                ]}
                onPress={() => setConfig((prev) => ({ ...prev, template: template.id }))}
              >
                <Text
                  style={[
                    styles.templateLabel,
                    config.template === template.id && styles.templateLabelActive,
                  ]}
                >
                  {template.label}
                </Text>
                <Text style={styles.templateDescription}>{template.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customize</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Slogan</Text>
            <TextInput
              style={styles.input}
              value={config.slogan}
              onChangeText={(text) => setConfig((prev) => ({ ...prev, slogan: text }))}
              placeholder="Enter a catchy slogan..."
              placeholderTextColor={Colors.gray}
              maxLength={100}
            />
          </View>

          {config.template === 'bold' && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>
                <Palette size={16} color={Colors.gray} /> Background Color
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.colorList}
              >
                {COLOR_OPTIONS.map((color) => (
                  <TouchableOpacity
                    key={color.value}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color.value },
                      config.backgroundColor === color.value && styles.colorOptionActive,
                    ]}
                    onPress={() =>
                      setConfig((prev) => ({ ...prev, backgroundColor: color.value }))
                    }
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {config.template === 'modern' && truck.hero_image && (
            <View style={styles.inputContainer}>
              <View style={styles.toggleContainer}>
                <Text style={styles.inputLabel}>Show Truck Photo</Text>
                <TouchableOpacity
                  style={[
                    styles.toggle,
                    config.showPhoto && styles.toggleActive,
                  ]}
                  onPress={() =>
                    setConfig((prev) => ({ ...prev, showPhoto: !prev.showPhoto }))
                  }
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      config.showPhoto && styles.toggleThumbActive,
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preview</Text>
          <View style={styles.previewContainer}>
            <View style={styles.posterWrapper} ref={posterRef} collapsable={false}>
              <PosterRenderer
                template={config.template}
                truckName={truck.name}
                cuisine={truck.cuisine_type}
                photoUrl={truck.hero_image}
                qrImage={qrDataUrl}
                slogan={config.slogan}
                backgroundColor={config.backgroundColor}
                showPhoto={config.showPhoto}
              />
            </View>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.primaryButton, isExporting && styles.buttonDisabled]}
            onPress={handleExport}
            disabled={isExporting}
          >
            <Download size={20} color={Colors.light} />
            <Text style={styles.primaryButtonText}>
              {isExporting ? 'Exporting...' : 'Download Poster'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, isExporting && styles.buttonDisabled]}
            onPress={handleShare}
            disabled={isExporting}
          >
            <Share2 size={20} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>Share Poster</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            💡 Print this poster for your truck window, share on Instagram/TikTok, or add to menus
          </Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightGray,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.gray,
    lineHeight: 22,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 16,
  },
  templateList: {
    gap: 12,
  },
  templateCard: {
    backgroundColor: Colors.light,
    padding: 16,
    borderRadius: 16,
    minWidth: 180,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  templateCardActive: {
    borderColor: Colors.primary,
    backgroundColor: '#FFF5E6',
  },
  templateLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  templateLabelActive: {
    color: Colors.primary,
  },
  templateDescription: {
    fontSize: 12,
    color: Colors.gray,
    lineHeight: 16,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.light,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: Colors.dark,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  colorList: {
    gap: 12,
  },
  colorOption: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorOptionActive: {
    borderColor: Colors.dark,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.gray,
    padding: 2,
  },
  toggleActive: {
    backgroundColor: Colors.success,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.light,
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
  previewContainer: {
    alignItems: 'center',
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  posterWrapper: {
    transform: [{ scale: 0.35 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
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
  buttonDisabled: {
    opacity: 0.5,
  },
  infoCard: {
    backgroundColor: '#FFF9E6',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFB800',
  },
  infoText: {
    fontSize: 14,
    color: Colors.dark,
    lineHeight: 20,
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
