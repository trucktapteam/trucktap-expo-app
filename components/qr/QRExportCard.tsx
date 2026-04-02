import React from 'react';
import { View, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';
import QRGenerator from './QRGenerator';
import type { QRGenerationOptions } from '@/types/qr';

interface QRExportCardProps {
  url: string;
  options: QRGenerationOptions;
  onGenerated?: (dataUrl: string) => void;
}

const QRExportCard = React.forwardRef<View, QRExportCardProps>(
  ({ url, options, onGenerated }, ref) => {
    return (
      <View ref={ref} style={styles.card}>
        <QRGenerator
          url={url}
          options={options}
          onGenerated={onGenerated}
        />
      </View>
    );
  }
);

QRExportCard.displayName = 'QRExportCard';

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light,
    borderRadius: 24,
    padding: 24,
    borderWidth: 3,
    borderColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default QRExportCard;
