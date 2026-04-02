import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ChevronLeft, Camera, MapPin, Phone, Globe } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import Toast from '@/components/Toast';
import AuthPromptModal from '@/components/AuthPromptModal';
import { supabase } from '@/lib/supabase';

const CUISINES = [
  'Mexican',
  'American',
  'Coffee',
  'Italian',
  'Asian',
  'BBQ',
  'Desserts',
  'Snow Cones',
  'Seafood',
  'Vegetarian',
  'Mediterranean',
  'Other',
];

export default function EditProfile() {
  const router = useRouter();
  const { getUserTruck, updateTruckDetails } = useApp();
  const { isAuthenticated } = useAuth();
  const truck = getUserTruck();
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

  const [name, setName] = useState<string>('');
  const [cuisineType, setCuisineType] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [website, setWebsite] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [heroImage, setHeroImage] = useState<string>('');
  const [logo, setLogo] = useState<string>('');
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({ message: '', type: 'success', visible: false });

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (truck) {
      setName(truck.name || '');
      setCuisineType(truck.cuisine_type || '');
      setPhone(truck.phone || '');
      setBio(truck.bio || '');
      setWebsite(truck.website || '');
      setAddress(truck.location?.address || '');
      setHeroImage(truck.hero_image || '');
      setLogo(truck.logo || '');
    }
  }, [truck]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    if (!truck) return;

    const changed =
      name !== (truck.name || '') ||
      cuisineType !== (truck.cuisine_type || '') ||
      phone !== (truck.phone || '') ||
      bio !== (truck.bio || '') ||
      website !== (truck.website || '') ||
      address !== (truck.location?.address || '') ||
      heroImage !== (truck.hero_image || '') ||
      logo !== (truck.logo || '');

    console.log('[EditProfile] hasChanges:', changed);
    setHasChanges(changed);
  }, [name, cuisineType, phone, bio, website, address, heroImage, logo, truck]);

  const formatPhoneNumber = useCallback((text: string) => {
    const cleaned = text.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
    if (match) {
      let formatted = '';
      if (match[1]) formatted += `(${match[1]}`;
      if (match[2]) formatted += `) ${match[2]}`;
      if (match[3]) formatted += `-${match[3]}`;
      return formatted;
    }
    return text;
  }, []);

  const handlePhoneChange = useCallback(
    (text: string) => {
      const formatted = formatPhoneNumber(text);
      setPhone(formatted);
      if (errors.phone) {
        setErrors((prev) => ({ ...prev, phone: '' }));
      }
    },
    [formatPhoneNumber, errors.phone]
  );

  const handleBioChange = useCallback(
    (text: string) => {
      if (text.length <= 300) {
        setBio(text);
        if (errors.bio) {
          setErrors((prev) => ({ ...prev, bio: '' }));
        }
      }
    },
    [errors.bio]
  );

  const validateForm = useCallback(() => {
    const newErrors: { [key: string]: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Truck name is required';
    }

    if (!cuisineType.trim()) {
      newErrors.cuisineType = 'Cuisine type is required';
    }

    const phoneDigits = phone.replace(/\D/g, '');
    if (phone.trim() && phoneDigits.length > 0 && phoneDigits.length < 10) {
      newErrors.phone = 'Please enter a valid 10-digit phone number';
    }

    if (website.trim() && !website.match(/^https?:\/\//)) {
      newErrors.website = 'Website must start with http:// or https://';
    }

    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      setToast({ message: 'Please fix the errors before saving.', type: 'error', visible: true });
    }
    
    return Object.keys(newErrors).length === 0;
  }, [name, cuisineType, phone, website]);

  const handleSave = useCallback(async () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    if (!validateForm()) {
      return;
    }

    if (!truck) return;

    setIsSaving(true);

    try {
      const updates: any = {
        name: name.trim(),
        cuisine_type: cuisineType.trim(),
        phone: phone.trim(),
        bio: bio.trim(),
        hero_image: heroImage,
        logo: logo,
        website: website.trim(),
      };

      if (address.trim() !== (truck.location?.address || '')) {
        updates.location = {
          latitude: truck.location?.latitude || 37.7749,
          longitude: truck.location?.longitude || -122.4194,
          address: address.trim(),
        };
      }

      console.log('[EditProfile] Save payload:', JSON.stringify(updates, null, 2));
      await updateTruckDetails(truck.id, updates);
      console.log('[EditProfile] Save completed successfully');

      setToast({ message: 'Profile updated successfully!', type: 'success', visible: true });
      
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      console.error('Error saving profile:', error);
      const message = error?.message || 'Failed to save profile. Please try again.';
      setToast({ message, type: 'error', visible: true });
    } finally {
      setIsSaving(false);
    }
  }, [
    validateForm,
    truck,
    name,
    cuisineType,
    phone,
    bio,
    website,
    address,
    heroImage,
    logo,
    updateTruckDetails,
    router,
    isAuthenticated,
  ]);

  // helper to upload a file URI to Supabase storage and return a public URL
  const uploadImageAsync = useCallback(
  async (uri: string, truckId: string, type: 'hero' | 'logo'): Promise<string> => {
    try {
      console.log('[EditProfile] uploading image', uri);

      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const filePath = `${truckId}/${type}-${Date.now()}.jpg`;

      console.log('[EditProfile] storage path:', filePath);

      const { error: uploadError } = await supabase.storage
        .from('truck-images')
        .upload(filePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('truck-images').getPublicUrl(filePath);

      console.log('[EditProfile] public url retrieved', publicUrl);
      return publicUrl;
    } catch (err) {
      console.error('[EditProfile] uploadImageAsync error:', err);
      throw err;
    }
  },
  []
);

  const pickImage = useCallback(
    async (type: 'hero' | 'logo') => {
      if (Platform.OS === 'web') {
        const url = prompt('Enter the URL of your image:');
        if (url) {
          if (type === 'hero') {
            setHeroImage(url);
          } else {
            setLogo(url);
          }
        }
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: type === 'hero' ? [16, 9] : [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const localUri = result.assets[0].uri;
        if (truck && truck.id) {
          try {
            const publicUrl = await uploadImageAsync(localUri, truck.id, type);
            if (type === 'hero') {
              setHeroImage(publicUrl);
            } else {
              setLogo(publicUrl);
            }
          } catch (error) {
            console.error('[EditProfile] image upload failed, falling back to local uri', error);
            if (type === 'hero') {
              setHeroImage(localUri);
            } else {
              setLogo(localUri);
            }
          }
        } else {
          // no truck context, just use the local URI
          if (type === 'hero') {
            setHeroImage(localUri);
          } else {
            setLogo(localUri);
          }
        }
      }
    },
    [truck, uploadImageAsync]
  );

  if (!truck) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast({ ...toast, visible: false })}
      />
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color={Colors.dark} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Edit Truck Profile</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <KeyboardAvoidingView
          style={styles.scrollView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Profile Photo</Text>
              <View style={styles.photoSection}>
                <View style={styles.photoItem}>
                  <Text style={styles.photoLabel}>Logo</Text>
                  <View style={styles.logoContainer}>
                    {logo ? (
                      <>
                        <Image source={{ uri: logo }} style={styles.logoImage} contentFit="cover" />
                        <TouchableOpacity
                          style={styles.changeLogoButton}
                          onPress={() => pickImage('logo')}
                        >
                          <Camera size={14} color="#fff" />
                          <Text style={styles.changePhotoText}>Change</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={styles.uploadLogoButton}
                        onPress={() => pickImage('logo')}
                      >
                        <Camera size={24} color={Colors.primary} />
                        <Text style={styles.uploadLogoText}>Upload Logo</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <View style={styles.photoItem}>
                  <Text style={styles.photoLabel}>Hero Image</Text>
                  <View style={styles.heroContainer}>
                    {heroImage ? (
                      <>
                        <Image
                          source={{ uri: heroImage }}
                          style={styles.heroImage}
                          contentFit="cover"
                        />
                        <TouchableOpacity
                          style={styles.changeHeroButton}
                          onPress={() => pickImage('hero')}
                        >
                          <Camera size={14} color="#fff" />
                          <Text style={styles.changePhotoText}>Change Photo</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={styles.uploadHeroButton}
                        onPress={() => pickImage('hero')}
                      >
                        <Camera size={32} color={Colors.primary} />
                        <Text style={styles.uploadHeroText}>Upload Hero Image</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Basic Info</Text>
              <View style={styles.card}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    Truck Name <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.input, errors.name && styles.inputError]}
                    value={name}
                    onChangeText={(text) => {
                      setName(text);
                      if (errors.name) {
                        setErrors((prev) => ({ ...prev, name: '' }));
                      }
                    }}
                    placeholder="Enter truck name"
                    placeholderTextColor={Colors.gray}
                  />
                  {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>
                    Cuisine Type <Text style={styles.required}>*</Text>
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.cuisineSelector}
                  >
                    {CUISINES.map((cuisine) => (
                      <TouchableOpacity
                        key={cuisine}
                        style={[
                          styles.cuisineChip,
                          cuisineType === cuisine && styles.cuisineChipActive,
                        ]}
                        onPress={() => {
                          setCuisineType(cuisine);
                          if (errors.cuisineType) {
                            setErrors((prev) => ({ ...prev, cuisineType: '' }));
                          }
                        }}
                      >
                        <Text
                          style={[
                            styles.cuisineChipText,
                            cuisineType === cuisine && styles.cuisineChipTextActive,
                          ]}
                        >
                          {cuisine}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {errors.cuisineType ? (
                    <Text style={styles.errorText}>{errors.cuisineType}</Text>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Details</Text>
              <View style={styles.card}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Bio / Description</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={bio}
                    onChangeText={handleBioChange}
                    placeholder="Tell customers about your truck..."
                    placeholderTextColor={Colors.gray}
                    multiline
                    numberOfLines={4}
                    maxLength={300}
                  />
                  <Text style={styles.charCounter}>
                    {bio.length}/300 characters
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Contact Info</Text>
              <View style={styles.card}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Phone Number (Optional)</Text>
                  <View style={styles.inputWithIcon}>
                    <Phone size={18} color={Colors.gray} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, styles.inputWithIconText, errors.phone && styles.inputError]}
                      value={phone}
                      onChangeText={handlePhoneChange}
                      placeholder="(555) 555-5555"
                      placeholderTextColor={Colors.gray}
                      keyboardType="phone-pad"
                      maxLength={14}
                    />
                  </View>
                  {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Address (Optional)</Text>
                  <View style={styles.inputWithIcon}>
                    <MapPin size={18} color={Colors.gray} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, styles.inputWithIconText, errors.address && styles.inputError]}
                      value={address}
                      onChangeText={(text) => {
                        setAddress(text);
                        if (errors.address) {
                          setErrors((prev) => ({ ...prev, address: '' }));
                        }
                      }}
                      placeholder="Enter your truck's address"
                      placeholderTextColor={Colors.gray}
                    />
                  </View>
                  {errors.address ? <Text style={styles.errorText}>{errors.address}</Text> : null}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Website (Optional)</Text>
                  <View style={styles.inputWithIcon}>
                    <Globe size={18} color={Colors.gray} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, styles.inputWithIconText, errors.website && styles.inputError]}
                      value={website}
                      onChangeText={(text) => {
                        setWebsite(text);
                        if (errors.website) {
                          setErrors((prev) => ({ ...prev, website: '' }));
                        }
                      }}
                      placeholder="https://example.com"
                      placeholderTextColor={Colors.gray}
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                  </View>
                  {errors.website ? <Text style={styles.errorText}>{errors.website}</Text> : null}
                </View>
              </View>
            </View>

            <View style={styles.previewSection}>
              <Text style={styles.previewTitle}>Preview</Text>
              <View style={styles.previewCard}>
                {logo ? (
                  <Image source={{ uri: logo }} style={styles.previewLogo} contentFit="cover" />
                ) : null}
                <View style={styles.previewInfo}>
                  <Text style={styles.previewName}>{name || 'Truck Name'}</Text>
                  <Text style={styles.previewCuisine}>
                    {cuisineType || 'Cuisine Type'}
                  </Text>
                </View>
              </View>
            </View>

          <View style={styles.bottomPadding} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveButton, (!hasChanges || isSaving) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!hasChanges || isSaving}
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
      </View>

      <AuthPromptModal
        visible={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          router.back();
        }}
        action="edit truck profile"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },

  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.gray,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  photoSection: {
    gap: 16,
  },
  photoItem: {
    gap: 8,
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    position: 'relative',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  uploadLogoButton: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.lightGray,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  uploadLogoText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  changeLogoButton: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 8,
    gap: 4,
  },
  changePhotoText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#fff',
  },
  heroContainer: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  uploadHeroButton: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.lightGray,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadHeroText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  changeHeroButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  required: {
    color: Colors.error,
  },
  input: {
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.dark,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputError: {
    borderColor: Colors.error,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  charCounter: {
    fontSize: 12,
    color: Colors.gray,
    textAlign: 'right',
    marginTop: 4,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  inputWithIconText: {
    paddingLeft: 44,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 4,
  },
  cuisineSelector: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
  },
  cuisineChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.lightGray,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cuisineChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  cuisineChipText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.gray,
  },
  cuisineChipTextActive: {
    color: '#fff',
  },
  previewSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 12,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  previewLogo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 2,
  },
  previewCuisine: {
    fontSize: 14,
    color: Colors.gray,
  },
  bottomPadding: {
    height: 100,
  },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: Colors.gray,
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#fff',
  },
});
