import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { User, Camera } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import AuthPromptModal from '@/components/AuthPromptModal';

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const { currentUser, setCurrentUser, refreshCustomerProfile } = useApp();
  console.log('[ProfileScreen] currentUser:', currentUser);
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const styles = createStyles(colors);

  const [displayName, setDisplayName] = useState<string>(currentUser?.name || '');
  const [photoUri, setPhotoUri] = useState<string | undefined>(currentUser?.profile_photo);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({ message: '', type: 'success', visible: false });
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const handleChangePhoto = async () => {
  if (!currentUser) {
    setToast({ message: 'No user logged in', type: 'error', visible: true });
    return;
  }

  const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (permissionResult.granted === false) {
    setToast({ message: 'Please allow access to your photos.', type: 'error', visible: true });
    return;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images' as any,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });

  if (result.canceled || !result.assets[0]) {
    return;
  }

  try {
    const image = result.assets[0];
    const fileExt = image.uri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;

    console.log('[EditProfile] Uploading image:', image.uri);
    console.log('[EditProfile] File name:', fileName);

    const response = await fetch(image.uri);
    const arrayBuffer = await response.arrayBuffer();

    const { data, error } = await supabase.storage
      .from('profile-photos')
      .upload(fileName, arrayBuffer, {
        contentType: image.mimeType || `image/${fileExt}`,
        upsert: true,
      });

    if (error) {
      console.error('[EditProfile] Upload error:', error);
      setToast({ message: 'Failed to upload photo.', type: 'error', visible: true });
      return;
    }

    console.log('[EditProfile] Upload success:', data);

    const { data: publicUrlData } = supabase.storage
      .from('profile-photos')
      .getPublicUrl(fileName);

    console.log('[EditProfile] Public URL:', publicUrlData.publicUrl);

    setPhotoUri(publicUrlData.publicUrl);
    setToast({ message: 'Photo uploaded successfully.', type: 'success', visible: true });
  } catch (error) {
    console.error('[EditProfile] Unexpected upload error:', error);
    setToast({ message: 'Something went wrong uploading photo.', type: 'error', visible: true });
  }
};

  const handleSave = async () => {
    if (!currentUser) {
      setToast({ message: 'No user logged in', type: 'error', visible: true });
      return;
    }

    if (!displayName.trim()) {
      setToast({ message: 'Please enter a display name', type: 'error', visible: true });
      return;
    }

    setIsSaving(true);

    const payload = {
      display_name: displayName.trim(),
      profile_photo: photoUri,
    };

    console.log('Outgoing profile update payload:', payload);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', currentUser.id);

      if (error) {
        console.error('Supabase update error:', error);
        setToast({ message: 'Failed to update profile. Please try again.', type: 'error', visible: true });
      } else {
        console.log('Supabase update result:', data);
        setCurrentUser({
          ...currentUser,
          name: displayName,
          profile_photo: photoUri,
        });
        // Refresh customer profile from Supabase to sync UI
        console.log('[CustomerEditProfile] save succeeded, calling refreshCustomerProfile');
await refreshCustomerProfile();
console.log('[CustomerEditProfile] refreshCustomerProfile FINISHED');
        setToast({ message: 'Profile updated successfully!', type: 'success', visible: true });
        setTimeout(() => {
          router.back();
        }, 1500);
      }
    } catch (err) {
      console.error('Unexpected error updating profile:', err);
      setToast({ message: 'Failed to update profile. Please try again.', type: 'error', visible: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const handleAuthModalClose = () => {
    setShowAuthModal(false);
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView 
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.photoSection}>
          <View style={styles.photoContainer}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <User size={48} color={colors.primary} />
              </View>
            )}
          </View>
          <TouchableOpacity 
            style={styles.changePhotoButton}
            onPress={handleChangePhoto}
            disabled={isSaving}
          >
            <Camera size={18} color={colors.primary} />
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
            </View>

            <View style={styles.formSection}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter your name"
            placeholderTextColor={colors.secondaryText}
            editable={!isSaving}
          />
            </View>

            <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.primaryButton, isSaving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={handleCancel}
            disabled={isSaving}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AuthPromptModal
        visible={showAuthModal}
        onClose={handleAuthModalClose}
        action="edit your profile"
        returnRoute="/(customer)/edit-profile"
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  photoContainer: {
    marginBottom: 16,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  changePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  changePhotoText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.primary,
  },
  formSection: {
    marginBottom: 32,
  },
  label: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonContainer: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  secondaryButton: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: colors.text,
  },
});
