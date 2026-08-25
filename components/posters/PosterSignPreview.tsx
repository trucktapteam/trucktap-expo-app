import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  LayoutChangeEvent,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { Download } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { FoodTruck } from '@/types';
import BoldPoster from '@/components/posters/BoldPoster';
import QRCodeDataUrlGenerator from '@/components/qr/QRCodeDataUrlGenerator';
import { getTruckShareUrl } from '@/lib/truckShare';

// BoldPoster (the default style from the poster creator, app/(truck)/poster.tsx)
// renders at a fixed natural width of 340. We show a scaled-down preview of that
// same, unmodified component directly on the dashboard, plus a hidden full-size
// copy purely for high-quality capture - mirroring the proven capture approach
// already used by PosterScreen's captureStaticPoster.
//
// Fallback aspect ratio (width:height) used only for the first paint, before
// BoldPoster's real intrinsic size has been measured.
const FALLBACK_ASPECT_RATIO = 340 / 776;
const PREVIEW_MAX_WIDTH = 260;

type PosterSignPreviewProps = {
  truck: FoodTruck;
  onShared?: () => void;
};

export default function PosterSignPreview({ truck, onShared }: PosterSignPreviewProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  // BoldPoster's true, unconstrained rendered size (measured once - see
  // measureWrap below for why this reports correctly).
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  // The on-screen width actually available for the preview inside the
  // "Share Your Truck" card - re-measured on every layout pass so rotation /
  // different phone widths stay correct, not just the first render.
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const captureTargetRef = useRef<View>(null);

  const handleMeasureNaturalSize = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setNaturalSize((current) => current ?? { width, height });
    }
  }, []);

  const handleMeasureContainer = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) {
      setContainerWidth(width);
    }
  }, []);

  const scale = naturalSize && containerWidth ? containerWidth / naturalSize.width : null;

  const saveOrShareSign = async () => {
    if (!truck || !qrDataUrl) return;

    if (Platform.OS === 'web') {
      Alert.alert('Not available on web', 'Saving or sharing the QR sign is available in the TruckTap mobile app.');
      return;
    }

    try {
      setIsBusy(true);

      const target = captureTargetRef.current;
      if (!target) {
        throw new Error('The QR sign is not ready yet.');
      }

      const uri = await captureRef(target, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      if (!uri) {
        throw new Error('The QR sign image could not be created.');
      }

      await MediaLibrary.saveToLibraryAsync(uri);

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Save or Share Your QR Sign',
        });
      }

      onShared?.();
    } catch (error) {
      console.error('Error saving/sharing QR sign:', error);
      Alert.alert('Error', 'Could not save or share your QR sign image.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <QRCodeDataUrlGenerator
        value={getTruckShareUrl(truck.id)}
        size={600}
        onGenerated={setQrDataUrl}
        onError={() => setQrDataUrl('')}
      />

      {qrDataUrl ? (
        // Positioned off-screen rather than clamped to a 1x1 box: an
        // explicit width:1 parent would trigger the exact same default
        // stretch bug as the preview below, handing react-native-view-shot
        // a 1x1 target to capture. Off-screen positioning keeps this
        // invisible without constraining its size, so captureRef reads
        // BoldPoster's real, unmodified 340pt-wide layout.
        <View style={styles.offscreenCapture} pointerEvents="none">
          <View ref={captureTargetRef} collapsable={false} style={styles.autoSize}>
            <BoldPoster truck={truck} qrDataUrl={qrDataUrl} />
          </View>
        </View>
      ) : null}

      <View
        onLayout={handleMeasureContainer}
        style={[
          styles.previewClip,
          {
            aspectRatio: naturalSize ? naturalSize.width / naturalSize.height : FALLBACK_ASPECT_RATIO,
          },
        ]}
      >
        {qrDataUrl ? (
          <>
            <View
              onLayout={handleMeasureNaturalSize}
              pointerEvents="none"
              // style.autoSize (alignSelf: 'flex-start') is the actual fix:
              // without it, this child inherits the parent's default
              // alignItems:'stretch' and gets clamped to previewClip's
              // width *before* onLayout ever reports BoldPoster's true
              // 340pt size, so `scale` below silently computes as ~1 (no
              // scaling) and the poster overflows, clipped by previewClip's
              // overflow:hidden - exactly the reported bug. alignSelf:
              // 'flex-start' lets this view report its real intrinsic size
              // regardless of how narrow its parent is.
              style={[
                styles.autoSize,
                scale !== null && naturalSize
                  ? {
                      opacity: 1,
                      transform: [
                        { translateX: -(naturalSize.width * (1 - scale)) / 2 },
                        { translateY: -(naturalSize.height * (1 - scale)) / 2 },
                        { scale },
                      ],
                    }
                  : { opacity: 0 },
              ]}
            >
              <BoldPoster truck={truck} qrDataUrl={qrDataUrl} />
            </View>
            {scale === null && (
              <View style={styles.loadingOverlay}>
                <Text style={styles.loadingText}>Preparing your QR sign…</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>Preparing your QR sign…</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.saveButton}
        onPress={saveOrShareSign}
        disabled={isBusy || !qrDataUrl}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Save or share QR sign"
      >
        <Download size={20} color={Colors.light} />
        <Text style={styles.saveButtonText}>
          {isBusy ? 'Preparing...' : 'Save / Share QR Sign'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  offscreenCapture: {
    position: 'absolute',
    top: -10000,
    left: -10000,
    opacity: 0,
  },
  // Prevents the default flexbox alignItems:'stretch' from clamping this
  // view to its parent's (narrower) width before it can report its own
  // true content-driven size via onLayout. This is the fix for both the
  // visible preview and the hidden capture copy.
  autoSize: {
    alignSelf: 'flex-start',
  },
  previewClip: {
    width: '100%',
    maxWidth: PREVIEW_MAX_WIDTH,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 16,
    marginBottom: 14,
    backgroundColor: Colors.lightGray,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.gray,
    fontWeight: '600' as const,
    textAlign: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    width: '100%',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: Colors.light,
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
