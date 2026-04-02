import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import QRCode from 'qrcode';
import Colors from '@/constants/colors';
import type { QRGenerationOptions, QRCodeComponentProps } from '@/types/qr';
import { DEBUG } from '@/constants/debug';

const QRGenerator: React.FC<QRCodeComponentProps> = ({
  url,
  options,
  onGenerated,
  onError,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const qrCanvasRef = useRef<View>(null);
  const isReadyRef = useRef<boolean>(false);

  const generateQRCode = useCallback(async () => {
    if (!url || url.trim().length === 0) {
      if (DEBUG) console.log('Skipping QR generation: URL is empty');
      setIsGenerating(false);
      return;
    }

    if (!qrCanvasRef.current) {
      if (DEBUG) console.log('Skipping QR generation: Canvas ref not ready');
      return;
    }

    if (!isReadyRef.current) {
      if (DEBUG) console.log('Skipping QR generation: Component not mounted');
      return;
    }

    try {
      setIsGenerating(true);
      setErrorMessage('');

      if (DEBUG) console.log('Generating QR code for URL:', url);
      
      const qrOptions = buildQROptions(options);
      const dataUrl = await QRCode.toDataURL(url, qrOptions);
      
      if (DEBUG) console.log('QR code generated, length:', dataUrl.length);
      
      setQrDataUrl(dataUrl);
      onGenerated?.(dataUrl);
    } catch (error) {
      console.error('Error generating QR code:', error);
      
      const err = error instanceof Error ? error : new Error('QR generation failed');
      const message = err.message || 'Unknown error';
      setErrorMessage(`QR generation failed: ${message}`);
      onError?.(err);
    } finally {
      setIsGenerating(false);
    }
  }, [url, options, onGenerated, onError]);

  useEffect(() => {
    isReadyRef.current = true;
    return () => {
      isReadyRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!url || url.trim().length === 0) {
      if (DEBUG) console.log('URL is empty, not generating QR');
      setIsGenerating(false);
      setErrorMessage('Cannot generate QR: URL is empty');
      return;
    }

    const rafId = requestAnimationFrame(() => {
      if (qrCanvasRef.current) {
        if (DEBUG) console.log('Triggering QR generation');
        void generateQRCode();
      } else {
        if (DEBUG) console.log('Canvas ref not ready after RAF');
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [url, options, generateQRCode]);

  useEffect(() => {
    if (!url || url.trim().length === 0) {
      setIsGenerating(false);
      return;
    }

    const safetyTimeout = setTimeout(() => {
      if (isGenerating) {
        console.warn('⚠️ Safety timeout triggered - forcing loading state to false');
        setIsGenerating(false);
        if (!qrDataUrl && !errorMessage) {
          setErrorMessage('QR generation timed out');
        }
      }
    }, 500);

    return () => clearTimeout(safetyTimeout);
  }, [url, isGenerating, qrDataUrl, errorMessage]);

  if (isGenerating) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.loadingText}>Generating QR...</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <Text style={styles.errorDetail}>URL: {url || '(empty)'}</Text>
      </View>
    );
  }

  if (!qrDataUrl) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>QR code failed to generate</Text>
      </View>
    );
  }

  return (
    <View ref={qrCanvasRef} style={styles.container}>
      <Image
        source={{ uri: qrDataUrl }}
        style={styles.qrImage}
        contentFit="contain"
      />
      {options.logoConfig.includeLogo && (
        <View style={styles.logoOverlay}>
          <View
            style={[
              styles.logoPlaceholder,
              {
                width: options.logoConfig.logoSize,
                height: options.logoConfig.logoSize,
                backgroundColor: options.logoConfig.logoBackgroundColor || Colors.primary,
              },
            ]}
          >
            <View style={styles.logoInner} />
          </View>
        </View>
      )}
    </View>
  );
};

function buildQROptions(options: QRGenerationOptions) {
  const { style, logoConfig, width = 800, margin = 2 } = options;

  const baseOptions = {
    width,
    margin: logoConfig.includeLogo ? margin + 2 : margin,
    errorCorrectionLevel: logoConfig.includeLogo ? 'H' as const : 'M' as const,
  };

  switch (style) {
    case 'standard':
      return {
        ...baseOptions,
        color: {
          dark: '#111111',
          light: '#FFFFFF',
        },
      };
    
    case 'rounded':
      return {
        ...baseOptions,
        color: {
          dark: '#111111',
          light: '#FFFFFF',
        },
        rendererOpts: {
          quality: 1,
        },
      };
    
    case 'dots':
      return {
        ...baseOptions,
        color: {
          dark: '#111111',
          light: '#FFFFFF',
        },
        rendererOpts: {
          quality: 1,
        },
      };
    
    case 'gradient':
      return {
        ...baseOptions,
        color: {
          dark: '#FF6B00',
          light: '#FFF5E6',
        },
      };
    
    case 'logo-ready':
      return {
        ...baseOptions,
        width: 900,
        margin: 4,
        errorCorrectionLevel: 'H' as const,
        color: {
          dark: '#111111',
          light: '#FFFFFF',
        },
      };
    
    default:
      return {
        ...baseOptions,
        color: {
          dark: '#111111',
          light: '#FFFFFF',
        },
      };
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: 280,
    height: 280,
  },
  qrImage: {
    width: 280,
    height: 280,
  },
  placeholder: {
    width: 280,
    height: 280,
    backgroundColor: Colors.lightGray,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: Colors.gray,
    fontWeight: '500' as const,
  },
  errorContainer: {
    width: 280,
    height: 280,
    backgroundColor: `${Colors.warning}15`,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderWidth: 2,
    borderColor: Colors.warning,
  },
  errorText: {
    fontSize: 14,
    color: Colors.dark,
    fontWeight: '600' as const,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 11,
    color: Colors.gray,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  logoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPlaceholder: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.light,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  logoInner: {
    width: '40%',
    height: '40%',
    backgroundColor: Colors.light,
    borderRadius: 4,
  },
});

export default QRGenerator;
