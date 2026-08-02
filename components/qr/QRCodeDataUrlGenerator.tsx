import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import QRCode from 'qrcode';
import QRCodeSVG from 'react-native-qrcode-svg';

type NativeSvgRef = {
  toDataURL: (
    callback: (data: string) => void,
    options?: { width: number; height: number }
  ) => void;
};

type QRCodeDataUrlGeneratorProps = {
  value: string;
  size?: number;
  onGenerated: (dataUrl: string) => void;
  onError: (error: Error) => void;
};

const normalizePngDataUrl = (value: string) =>
  value.startsWith('data:image/') ? value : `data:image/png;base64,${value}`;

export default function QRCodeDataUrlGenerator({
  value,
  size = 600,
  onGenerated,
  onError,
}: QRCodeDataUrlGeneratorProps) {
  const svgRef = React.useRef<NativeSvgRef | null>(null);
  const [nativeSvgReady, setNativeSvgReady] = React.useState(false);
  const onGeneratedRef = React.useRef(onGenerated);
  const onErrorRef = React.useRef(onError);

  React.useEffect(() => {
    onGeneratedRef.current = onGenerated;
    onErrorRef.current = onError;
  }, [onError, onGenerated]);

  React.useEffect(() => {
    if (!value) return;
    if (Platform.OS !== 'web' && !nativeSvgReady) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const generate = async () => {
      try {
        if (Platform.OS === 'web') {
          const dataUrl = await QRCode.toDataURL(value, {
            width: size,
            margin: 1,
            color: { dark: '#111111', light: '#FFFFFF' },
          });
          if (!cancelled) onGeneratedRef.current(dataUrl);
          return;
        }

        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (!svgRef.current) throw new Error('Native QR renderer is not ready.');

        const base64Png = await new Promise<string>((resolve, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('Native QR generation timed out.')),
            6000
          );
          svgRef.current!.toDataURL(data => {
            if (timeoutId) clearTimeout(timeoutId);
            if (data) resolve(data);
            else reject(new Error('Native QR renderer returned no image data.'));
          }, { width: size, height: size });
        });

        if (!cancelled) onGeneratedRef.current(normalizePngDataUrl(base64Png));
      } catch (error) {
        if (!cancelled) {
          onErrorRef.current(error instanceof Error ? error : new Error('QR generation failed.'));
        }
      }
    };

    void generate();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [nativeSvgReady, size, value]);

  if (Platform.OS === 'web' || !value) return null;

  return (
    <View style={styles.hiddenRenderer} pointerEvents="none" collapsable={false}>
      <QRCodeSVG
        getRef={(ref) => {
          svgRef.current = ref as NativeSvgRef | null;
          setNativeSvgReady(Boolean(ref));
        }}
        value={value}
        size={size}
        quietZone={16}
        backgroundColor="#FFFFFF"
        color="#111111"
        ecl="M"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenRenderer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
});
