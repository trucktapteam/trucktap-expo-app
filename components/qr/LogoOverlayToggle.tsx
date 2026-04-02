import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { ImagePlus, Info } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { QRLogoConfig } from '@/types/qr';

interface LogoOverlayToggleProps {
  logoConfig: QRLogoConfig;
  onLogoConfigChange: (config: QRLogoConfig) => void;
}

const LogoOverlayToggle: React.FC<LogoOverlayToggleProps> = ({
  logoConfig,
  onLogoConfigChange,
}) => {
  const toggleLogo = (value: boolean) => {
    onLogoConfigChange({
      ...logoConfig,
      includeLogo: value,
    });
  };

  const adjustLogoSize = (delta: number) => {
    const newSize = Math.max(40, Math.min(120, logoConfig.logoSize + delta));
    onLogoConfigChange({
      ...logoConfig,
      logoSize: newSize,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ImagePlus size={20} color={Colors.primary} />
          <Text style={styles.title}>Logo Overlay</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Beta</Text>
          </View>
        </View>
        <Switch
          value={logoConfig.includeLogo}
          onValueChange={toggleLogo}
          trackColor={{ false: Colors.lightGray, true: Colors.primary }}
          thumbColor={Colors.light}
        />
      </View>

      <View style={styles.infoCard}>
        <Info size={16} color={Colors.primary} />
        <Text style={styles.infoText}>
          Reserve space in your QR code center for a custom logo overlay.
        </Text>
      </View>

      {logoConfig.includeLogo && (
        <View style={styles.sizeControl}>
          <Text style={styles.sizeLabel}>Logo Size: {logoConfig.logoSize}px</Text>
          <View style={styles.sizeButtons}>
            <TouchableOpacity
              style={styles.sizeButton}
              onPress={() => adjustLogoSize(-10)}
            >
              <Text style={styles.sizeButtonText}>−</Text>
            </TouchableOpacity>
            <View style={styles.sizeValue}>
              <Text style={styles.sizeValueText}>{logoConfig.logoSize}</Text>
            </View>
            <TouchableOpacity
              style={styles.sizeButton}
              onPress={() => adjustLogoSize(10)}
            >
              <Text style={styles.sizeButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: Colors.lightGray,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark,
  },
  badge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.light,
    textTransform: 'uppercase',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF5E6',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 18,
  },
  sizeControl: {
    marginTop: 8,
  },
  sizeLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  sizeButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sizeButton: {
    width: 44,
    height: 44,
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeButtonText: {
    fontSize: 24,
    fontWeight: '600' as const,
    color: Colors.dark,
  },
  sizeValue: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeValueText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
});

export default LogoOverlayToggle;
