import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, CheckCircle2, ChevronLeft } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import {
  getTruckVisibilitySetupStatus,
  TruckVisibilitySetupRequirement,
} from '@/lib/truckVisibilitySetup';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';

const steps: TruckVisibilitySetupRequirement[] = ['name', 'logo', 'hero'];

const getStepIndex = (requirement: TruckVisibilitySetupRequirement): number =>
  Math.max(0, steps.indexOf(requirement));

export default function VisibilityWizardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ start?: string }>();
  const {
    getUserTruck,
    updateTruckDetails,
    beginImagePickerSession,
    endImagePickerSession,
  } = useApp();
  const truck = getUserTruck();
  const status = useMemo(() => truck ? getTruckVisibilitySetupStatus(truck) : null, [truck]);
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [heroImage, setHeroImage] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const appliedStartParamRef = useRef(false);

  useTruckLifecycleLogger('VisibilityWizard');

  useEffect(() => {
    if (!truck) return;

    setName(truck.name || '');
    setLogo(truck.logo || '');
    setHeroImage(truck.hero_image || '');

    if (status?.complete && !showSuccess && !saving) {
      router.replace('/(truck)/(tabs)/dashboard' as any);
      return;
    }

    if (params.start === 'name' && !appliedStartParamRef.current) {
      appliedStartParamRef.current = true;
      setStepIndex(0);
      return;
    }

    if (status?.missing.length) {
      setStepIndex(getStepIndex(status.missing[0]));
    }
  }, [params.start, router, saving, showSuccess, status, truck]);

  const activeStep = steps[stepIndex];
  const progressLabel = `${stepIndex + 1} of ${steps.length}`;

  const goToNextStep = (nextMissing: TruckVisibilitySetupRequirement[]) => {
    if (nextMissing.length === 0) {
      setShowSuccess(true);
      return;
    }

    setStepIndex(getStepIndex(nextMissing[0]));
  };

  const handleSaveName = async () => {
    if (!truck) return;

    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Truck name required', 'Enter your truck name before continuing.');
      return;
    }

    setSaving(true);
    try {
      await updateTruckDetails(truck.id, { name: trimmed });
      const nextStatus = getTruckVisibilitySetupStatus({ ...truck, name: trimmed });
      goToNextStep(nextStatus.missing.filter(requirement => requirement !== 'name'));
    } catch (error: any) {
      Alert.alert('Could not save', error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const uploadImageAsync = async (uri: string, truckId: string, type: 'logo' | 'hero'): Promise<string> => {
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const filePath = `${truckId}/${type}-${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from('truck-images')
      .upload(filePath, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      throw error;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('truck-images').getPublicUrl(filePath);

    return publicUrl;
  };

  const handlePickImage = async (type: 'logo' | 'hero') => {
    if (!truck) return;

    if (Platform.OS === 'web') {
      const url = prompt(`Enter your ${type === 'logo' ? 'logo' : 'hero image'} URL`);
      if (!url?.trim()) return;

      const publicUrl = url.trim();
      try {
        setSaving(true);
        if (type === 'logo') {
          setLogo(publicUrl);
        } else {
          setHeroImage(publicUrl);
        }
        await handleSaveImage(type, publicUrl);
      } catch (error: any) {
        Alert.alert('Could not save image', error?.message ?? 'Please try again.');
      } finally {
        setSaving(false);
      }
      return;
    }

    beginImagePickerSession(`VisibilityWizard:${type}`);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: type === 'logo' ? [1, 1] : [16, 9],
        quality: 0.8,
      });

      const asset = result.canceled ? null : result.assets?.[0] ?? null;
      if (!asset?.uri) return;

      setSaving(true);
      const publicUrl = await uploadImageAsync(asset.uri, truck.id, type);
      if (type === 'logo') {
        setLogo(publicUrl);
      } else {
        setHeroImage(publicUrl);
      }
      await handleSaveImage(type, publicUrl);
    } catch (error: any) {
      Alert.alert('Image upload failed', error?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
      endImagePickerSession(`VisibilityWizard:${type}`);
    }
  };

  const handleSaveImage = async (type: 'logo' | 'hero', publicUrl: string) => {
    if (!truck) return;

    const updates = type === 'logo'
      ? { logo: publicUrl }
      : { hero_image: publicUrl };

    await updateTruckDetails(truck.id, updates);
    const nextTruck = { ...truck, ...updates };
    const nextStatus = getTruckVisibilitySetupStatus(nextTruck);
    goToNextStep(nextStatus.missing.filter(requirement => requirement !== type));
  };

  const handleEnterDashboard = () => {
    router.replace('/(truck)/(tabs)/dashboard' as any);
  };

  if (!truck) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (showSuccess) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <CheckCircle2 size={42} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>🎉 Your truck is now visible to customers.</Text>
          <Text style={styles.successText}>
            You can add menu items, photos, announcements, and stops from the dashboard.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleEnterDashboard} activeOpacity={0.75}>
            <Text style={styles.primaryButtonText}>Enter Dashboard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        {stepIndex > 0 ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setStepIndex(current => Math.max(0, current - 1))}
            activeOpacity={0.75}
          >
            <ChevronLeft size={24} color={Colors.dark} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backButton} />
        )}
        <Text style={styles.headerTitle}>Get Visible</Text>
        <Text style={styles.progressText}>{progressLabel}</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {activeStep === 'name' ? (
            <View style={styles.stepCard}>
              <Text style={styles.stepTitle}>What is your truck called?</Text>
              <Text style={styles.stepSubtitle}>This is the name customers will see in TruckTap.</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Taco Paradise"
                placeholderTextColor={Colors.gray}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.primaryButton, (!name.trim() || saving) && styles.buttonDisabled]}
                onPress={handleSaveName}
                disabled={!name.trim() || saving}
                activeOpacity={0.75}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Continue</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {activeStep === 'logo' ? (
            <View style={styles.stepCard}>
              <Text style={styles.stepTitle}>Add your logo</Text>
              <Text style={styles.stepSubtitle}>Use the logo customers already recognize.</Text>
              <View style={styles.logoPreview}>
                {logo ? <Image source={{ uri: logo }} style={styles.logoImage} contentFit="cover" /> : <Camera size={34} color={Colors.primary} />}
              </View>
              <TouchableOpacity
                style={[styles.primaryButton, saving && styles.buttonDisabled]}
                onPress={() => handlePickImage('logo')}
                disabled={saving}
                activeOpacity={0.75}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Upload Logo</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {activeStep === 'hero' ? (
            <View style={styles.stepCard}>
              <Text style={styles.stepTitle}>Add a hero image</Text>
              <Text style={styles.stepSubtitle}>Pick a clear photo that represents your truck or food.</Text>
              <View style={styles.heroPreview}>
                {heroImage ? <Image source={{ uri: heroImage }} style={styles.heroImage} contentFit="cover" /> : <Camera size={38} color={Colors.primary} />}
              </View>
              <TouchableOpacity
                style={[styles.primaryButton, saving && styles.buttonDisabled]}
                onPress={() => handlePickImage('hero')}
                disabled={saving}
                activeOpacity={0.75}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Upload Hero Image</Text>}
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.dark,
  },
  progressText: {
    width: 42,
    fontSize: 12,
    fontWeight: '800' as const,
    color: Colors.gray,
    textAlign: 'right',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  stepCard: {
    gap: 16,
  },
  stepTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800' as const,
    color: Colors.dark,
  },
  stepSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.gray,
  },
  input: {
    backgroundColor: Colors.lightGray,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 17,
    color: Colors.dark,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800' as const,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  logoPreview: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: Colors.lightGray,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    alignSelf: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  heroPreview: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: Colors.lightGray,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: `${Colors.success}16`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '900' as const,
    color: Colors.dark,
    textAlign: 'center',
    marginBottom: 10,
  },
  successText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.gray,
    textAlign: 'center',
    marginBottom: 24,
  },
});
