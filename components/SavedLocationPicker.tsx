import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pencil, X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { SavedLocation } from '@/types';

export type SavedLocationPickerProps = {
  visible: boolean;
  onClose: () => void;
  locations: SavedLocation[];
  onSelect: (location: SavedLocation) => void;
  onEditRequest: (location: SavedLocation) => void;
};

export default function SavedLocationPicker({
  visible,
  onClose,
  locations,
  onSelect,
  onEditRequest,
}: SavedLocationPickerProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Saved Locations</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={22} color={Colors.dark} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {locations.length === 0 ? (
            <Text style={styles.emptyText}>No saved locations yet.</Text>
          ) : (
            locations.map(location => (
              <View key={location.id} style={styles.row}>
                <TouchableOpacity
                  style={styles.rowSelectArea}
                  onPress={() => onSelect(location)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${location.label}, ${location.location_text}`}
                >
                  <Text style={styles.rowLabel} numberOfLines={1}>{location.label}</Text>
                  <Text style={styles.rowAddress} numberOfLines={1}>{location.location_text}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rowEditButton}
                  onPress={() => onEditRequest(location)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${location.label}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Pencil size={16} color={Colors.gray} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  title: {
    fontSize: 19,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  closeButton: {
    padding: 4,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  rowSelectArea: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 2,
  },
  rowAddress: {
    fontSize: 13,
    color: Colors.gray,
  },
  rowEditButton: {
    padding: 6,
  },
});
