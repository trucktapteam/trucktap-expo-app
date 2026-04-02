import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import AuthPromptModal from '@/components/AuthPromptModal';
import Toast from '@/components/Toast';

export default function TruckSetupScreen() {
  const router = useRouter();
  const { completeOnboarding, refreshOwnedTrucks } = useApp();
  const { colors } = useTheme();
  const { isAuthenticated, user: authUser, isLoading: authLoading } = useAuth();
  const [truckName, setTruckName] = useState('');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({ visible: false, message: '', type: 'success' });

  useEffect(() => {
    if (authLoading) {
      console.log('[TruckSetup] Auth still loading');
      return;
    }
    if (!isAuthenticated || !authUser) {
      console.log('[TruckSetup] Not authenticated, showing modal');
      setShowAuthModal(true);
    } else {
      console.log('[TruckSetup] User is authenticated');
    }
  }, [isAuthenticated, authUser, authLoading]);

  useEffect(() => {
    if (pendingAction && isAuthenticated && authUser && !authLoading) {
      setPendingAction(false);
      setShowAuthModal(false);
    }
  }, [isAuthenticated, authUser, pendingAction, authLoading]);

  const handleComplete = async () => {
    if (!truckName.trim()) {
      console.log('[TruckSetup] Empty truck name');
      return;
    }

    if (authLoading) {
      console.log('[TruckSetup] Auth still loading');
      return;
    }

    if (!isAuthenticated || !authUser) {
      console.log('[TruckSetup] Not authenticated, showing modal');
      setPendingAction(true);
      setShowAuthModal(true);
      return;
    }

    if (!isSupabaseConfigured) {
      setToast({ visible: true, message: 'Database is not configured. Cannot create truck.', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    console.log('[TruckSetup] Creating truck in Supabase:', truckName.trim(), 'owner_id:', authUser.id);

    try {
      const { data, error } = await supabase
        .from('trucks')
        .insert({
          owner_id: authUser.id,
          name: truckName.trim(),
          hero_image: 'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=800',
          logo: 'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=200',
          cuisine_type: 'Unspecified',
          bio: '',
          is_open: false,
          phone: '',
          is_verified: false,
        })
        .select()
        .single();

      if (error) {
        console.log('[TruckSetup] Supabase insert error:', error.message);
        setToast({ visible: true, message: error.message, type: 'error' });
        setIsSubmitting(false);
        return;
      }

      // 🔔 Trigger new truck notification
try {
  await supabase.functions.invoke('notify-new-truck', {
    body: {
      truckId: data.id,
      truckName: data.name,
    },
  });

  console.log('[TruckSetup] New truck notification invoked');
} catch (err) {
  console.log('[TruckSetup] Error invoking new truck notification:', err);
}

      console.log('[TruckSetup] Truck created in Supabase:', data?.id);
      await refreshOwnedTrucks();
      completeOnboarding();
      console.log('[TruckSetup] Navigating to dashboard');
      router.replace('/(truck)/(tabs)/dashboard' as any);
    } catch (err: any) {
      console.log('[TruckSetup] Unexpected error:', err);
      setToast({ visible: true, message: err?.message ?? 'An unexpected error occurred', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>What&apos;s your truck&apos;s name?</Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
            You can update this and add more details later
          </Text>

          <TextInput
            style={[styles.input, { backgroundColor: colors.secondaryBackground, color: colors.text }]}
            placeholder="e.g., Taco Paradise"
            placeholderTextColor={colors.secondaryText}
            value={truckName}
            onChangeText={setTruckName}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }, (!truckName.trim() || isSubmitting) && styles.buttonDisabled]}
            onPress={handleComplete}
            disabled={!truckName.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <AuthPromptModal
        visible={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          router.back();
        }}
        action="create a truck"
      />

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 20 },
  content: { flex: 1 },
  title: { fontSize: 32, fontWeight: '700' as const, marginBottom: 12 },
  subtitle: { fontSize: 16, marginBottom: 40 },
  input: {
    borderRadius: 16,
    padding: 20,
    fontSize: 18,
    marginBottom: 24,
  },
  button: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 18, fontWeight: '600' as const, color: '#FFFFFF' },
});
