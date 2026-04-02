import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Colors from '@/constants/colors';
import type { QRVisualStyle, QRStyleOption } from '@/types/qr';

interface QRStyleSelectorProps {
  selectedStyle: QRVisualStyle;
  onStyleChange: (style: QRVisualStyle) => void;
  styles?: QRStyleOption[];
}

const DEFAULT_STYLES: QRStyleOption[] = [
  {
    id: 'standard',
    name: 'Standard',
    description: 'Classic square modules',
  },
  {
    id: 'rounded',
    name: 'Rounded',
    description: 'Soft rounded edges',
  },
  {
    id: 'dots',
    name: 'Dots',
    description: 'Circular module style',
  },
  {
    id: 'gradient',
    name: 'Gradient',
    description: 'Two-color gradient',
  },
  {
    id: 'logo-ready',
    name: 'Logo Ready',
    description: 'Center padding for logo',
  },
];

const QRStyleSelector: React.FC<QRStyleSelectorProps> = ({
  selectedStyle,
  onStyleChange,
  styles: customStyles,
}) => {
  const styleOptions = customStyles || DEFAULT_STYLES;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>QR Style</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {styleOptions.map((style) => (
          <TouchableOpacity
            key={style.id}
            style={[
              styles.option,
              selectedStyle === style.id && styles.optionSelected,
            ]}
            onPress={() => onStyleChange(style.id)}
          >
            <Text
              style={[
                styles.optionName,
                selectedStyle === style.id && styles.optionNameSelected,
              ]}
            >
              {style.name}
            </Text>
            <Text
              style={[
                styles.optionDescription,
                selectedStyle === style.id && styles.optionDescriptionSelected,
              ]}
            >
              {style.description}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 12,
  },
  scrollContent: {
    gap: 12,
    paddingRight: 20,
  },
  option: {
    backgroundColor: Colors.light,
    borderWidth: 2,
    borderColor: Colors.lightGray,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 140,
    alignItems: 'center',
  },
  optionSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  optionName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  optionNameSelected: {
    color: Colors.light,
  },
  optionDescription: {
    fontSize: 12,
    color: Colors.gray,
    textAlign: 'center',
  },
  optionDescriptionSelected: {
    color: Colors.light,
    opacity: 0.9,
  },
});

export default QRStyleSelector;
