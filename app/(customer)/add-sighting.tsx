import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { Camera, ImagePlus, LoaderCircle, MapPin } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Toast from '@/components/Toast';
import Colors from '@/constants/colors';
import { supabase } from '@/lib/supabase';

type LocationCoords = {
  latitude: number;
  longitude: number;
};

export default function AddSightingScreen() {
  const router = useRouter();
  const [truckName, setTruckName] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [coords, setCoords] = useState<LocationCoords | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false,
    message: '',
    type: 'success',
  });

  const captureLocation = useCallback(async () => {
    if (Platform.OS === 'web') return null;

    setIsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission is required to submit a sighting.');
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const nextCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setCoords(nextCoords);
      return nextCoords;
    } finally {
      setIsLocating(false);
    }
  }, []);

  useEffect(() => {
    void captureLocation().catch((error: any) => {
      const message = error?.message || 'Unable to get your location yet.';
      setToast({ visible: true, message, type: 'error' });
    });
  }, [captureLocation]);

  const pickPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setToast({ visible: true, message: 'Please allow photo access to upload a sighting.', type: 'error' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  }, []);

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setToast({ visible: true, message: 'Please allow camera access to take a sighting photo.', type: 'error' });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  }, []);

  const uploadPhotoAsync = useCallback(async (uri: string) => {
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const filePath = `sightings/sighting-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
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
    } = supabase.storage.from('truck-images').getPublicUrl(filePath);

    return publicUrl;
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!truckName.trim()) {
      setToast({ visible: true, message: 'Truck name is required.', type: 'error' });
      return;
    }

    if (!photoUri) {
      setToast({ visible: true, message: 'A photo is required for a sighting.', type: 'error' });
      return;
    }

    setIsSubmitting(true);

    try {
      const freshCoords = coords ?? await captureLocation();
      if (!freshCoords) {
        throw new Error('Unable to capture your location for this sighting.');
      }

      const photoUrl = await uploadPhotoAsync(photoUri);
      const expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();

      const { error } = await supabase.from('sightings').insert({
        truck_name: truckName.trim(),
        photo_url: photoUrl,
        latitude: freshCoords.latitude,
        longitude: freshCoords.longitude,
        notes: notes.trim() || null,
        expires_at: expiresAt,
      });

      if (error) {
        throw error;
      }

      setToast({ visible: true, message: 'Sighting added. It will stay visible for 24 hours.', type: 'success' });
      setTimeout(() => {
        router.back();
      }, 900);
    } catch (error: any) {
      const message = error?.message || 'Unable to submit your sighting right now.';
      setToast({ visible: true, message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }, [captureLocation, coords, notes, photoUri, router, truckName, uploadPhotoAsync]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Spot a Truck</Text>
            <Text style={styles.heroSubtitle}>
              Snap it. Drop it on the map.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Truck Name</Text>
            <TextInput
              style={styles.input}
              value={truckName}
              onChangeText={setTruckName}
              placeholder="Tasty Tacos Truck"
              placeholderTextColor={Colors.gray}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Photo</Text>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} contentFit="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <ImagePlus size={28} color={Colors.primary} />
                <Text style={styles.photoPlaceholderText}>A clear photo is required</Text>
              </View>
            )}

            <View style={styles.photoActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={takePhoto}>
                <Camera size={18} color={Colors.primary} />
                <Text style={styles.secondaryButtonText}>Use Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={pickPhoto}>
                <ImagePlus size={18} color={Colors.primary} />
                <Text style={styles.secondaryButtonText}>Choose Photo</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional details like cross street, event, or time window"
              placeholderTextColor={Colors.gray}
              multiline
              textAlignVertical="top"
            />
          </View>

          <View style={styles.locationCard}>
            <View style={styles.locationHeader}>
              <MapPin size={18} color={Colors.primary} />
              <Text style={styles.locationTitle}>Location</Text>
            </View>
            <Text style={styles.locationText}>
              {coords
                ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
                : isLocating
                ? 'Capturing your current location...'
                : 'We will capture your current location when you submit.'}
            </Text>
            <TouchableOpacity style={styles.refreshLocationButton} onPress={() => void captureLocation()}>
              <Text style={styles.refreshLocationText}>Refresh location</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={() => void handleSubmit()}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <LoaderCircle size={18} color="#fff" />
          ) : null}
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Submitting Sighting...' : 'Submit Sighting'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  heroCard: {
    backgroundColor: '#FFF6F0',
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFD9BF',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.gray,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.lightGray,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.dark,
  },
  notesInput: {
    minHeight: 110,
  },
  photoPreview: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: Colors.lightGray,
    marginBottom: 12,
  },
  photoPlaceholder: {
    height: 180,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    backgroundColor: '#FFF6F0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  photoPlaceholderText: {
    fontSize: 14,
    color: Colors.gray,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  locationCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  locationTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  locationText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray,
    marginBottom: 10,
  },
  refreshLocationButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  refreshLocationText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#fff',
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#fff',
  },
});
