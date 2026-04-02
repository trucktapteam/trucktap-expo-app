import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Dimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { ArrowLeft, Trash2, Plus, ImageIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import FullImageModal from '@/components/FullImageModal';
import { supabase } from '@/lib/supabase';

const { width } = Dimensions.get('window');
const SPACING = 12;
const COLUMNS = 3;
const IMAGE_SIZE = (width - (SPACING * (COLUMNS + 1))) / COLUMNS;

export default function TruckGalleryScreen() {
  const router = useRouter();
  const { getUserTruck, addGalleryImage, removeGalleryImage } = useApp();

  const truck = getUserTruck();
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  if (!truck) {
    return (
      <View style={styles.center}>
        <Text>No truck found</Text>
      </View>
    );
  }

  // helper to upload a gallery image to Supabase storage and return a public URL
  const uploadGalleryImageAsync = useCallback(
    async (uri: string, truckId: string): Promise<string> => {
      try {
        console.log('[TruckGallery] uploading gallery image', uri);
        const response = await fetch(uri);
        const arrayBuffer = await response.arrayBuffer();
        const filePath = `${truckId}/gallery-${Date.now()}.jpg`;
        console.log('[TruckGallery] storage path:', filePath);

        const { error: uploadError } = await supabase
          .storage
          .from('truck-images')
          .upload(filePath, arrayBuffer, {
            upsert: true,
            contentType: 'image/jpeg',
          });

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: { publicUrl },
        } = supabase
          .storage
          .from('truck-images')
          .getPublicUrl(filePath);

        console.log('[TruckGallery] public url retrieved', publicUrl);
        return publicUrl;
      } catch (err) {
        console.error('[TruckGallery] uploadGalleryImageAsync error:', err);
        throw err;
      }
    },
    []
  );

  const handleAddPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Enable photo access to upload images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const localUri = result.assets[0].uri;
      setLoading(true);

      try {
        const publicUrl = await uploadGalleryImageAsync(localUri, truck.id);
        addGalleryImage(truck.id, publicUrl);
        console.log('[TruckGallery] gallery image added successfully');
      } catch (error) {
        console.error('[TruckGallery] failed to upload gallery image:', error);
        Alert.alert('Upload Failed', 'Failed to upload image. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDelete = (imageUrl: string) => {
    Alert.alert(
      "Delete this photo?",
      "",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: () => removeGalleryImage(truck.id, imageUrl)
        }
      ]
    );
  };

  const handleImagePress = (imageUrl: string) => {
    setSelectedImage(imageUrl);
  };

  const handleCloseModal = () => {
    setSelectedImage(null);
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={Colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Photo Gallery</Text>
      </View>

      {/* ADD PHOTO BUTTON - STICKY */}
      <View style={styles.stickyButtonContainer}>
        <TouchableOpacity 
          style={styles.addButton} 
          onPress={handleAddPhoto}
          disabled={loading}
        >
          <Plus size={20} color={Colors.light} />
          <Text style={styles.addButtonText}>
            {loading ? 'Adding...' : 'Add Photo'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* PHOTO GRID */}
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {truck.images.length === 0 && (
          <View style={styles.emptyStateIllustrated}>
            <View style={styles.emptyIconCircle}>
              <ImageIcon size={48} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitleLarge}>Show off your truck</Text>
            <Text style={styles.emptyDescriptionLarge}>
              Photos help customers decide where to eat.
            </Text>
            <TouchableOpacity style={styles.emptyCtaButton} onPress={handleAddPhoto}>
              <Plus size={20} color="#fff" />
              <Text style={styles.emptyCtaText}>Add First Photo</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.grid}>
          {truck.images.map((url, index) => (
            <TouchableOpacity
              key={index}
              style={styles.imageWrapper}
              activeOpacity={0.8}
              onPress={() => handleImagePress(url)}
            >
              <Image source={{ uri: url }} style={styles.image} contentFit="cover" />

              <TouchableOpacity 
                style={styles.deleteButton}
                onPress={() => handleDelete(url)}
                activeOpacity={0.7}
              >
                <Trash2 size={16} color="white" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <FullImageModal
        visible={selectedImage !== null}
        onClose={handleCloseModal}
        image={selectedImage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.dark,
  },
  stickyButtonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: Colors.light,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  addButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: {
    color: Colors.light,
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    padding: SPACING,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING,
  },
  imageWrapper: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: Colors.lightGray,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  deleteButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 6,
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 60,
  },
  emptyStateIllustrated: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitleLarge: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyDescriptionLarge: {
    fontSize: 15,
    color: Colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  emptyCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyCtaText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
