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

type CreatedTruckRow = { id: string; name: string; owner_id: string };

export default function TruckSetupScreen() {
  const router = useRouter();
  const { completeOnboarding, currentUser, refreshOwnedTrucks, setCurrentUser } = useApp();
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
      // Truck creation and the customer->truck role promotion happen
      // atomically server-side in create_owned_truck(); the RPC only
      // accepts a name, so there is no client-controlled owner_id and no
      // way to insert into public.trucks directly (see
      // 20260721000000_secure_truck_creation.sql). Its return already
      // reflects the persisted, authorized row, so the separate
      // post-insert ownership verification this replaced is no longer
      // needed.
      const { data, error } = await supabase
        .rpc('create_owned_truck', { p_name: truckName.trim() })
        .single<CreatedTruckRow>();

      if (error || !data?.id) {
        const errorMessage = error
          ? [error.message, error.details, error.hint].filter(Boolean).join(' ')
          : 'Truck creation did not return a new truck record.';

        console.log('[TruckSetup] create_owned_truck RPC error:', {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
          truckName: truckName.trim(),
        });
        setToast({ visible: true, message: errorMessage, type: 'error' });
        setIsSubmitting(false);
        return;
      }

      console.log('[TruckSetup] New profile/truck created:', {
        truckId: data.id,
        truckName: data.name,
        ownerId: data.owner_id,
      });
      await refreshOwnedTrucks();

      completeOnboarding();

      if (currentUser?.role === 'admin') {
        console.log('[TruckSetup] Admin created truck, navigating to dashboard');
        router.replace('/(truck)/(tabs)/dashboard' as any);
        return;
      }

      setCurrentUser({
        id: authUser.id,
        name: authUser.name,
        email: authUser.email,
        favorites: currentUser?.favorites ?? [],
        role: 'truck',
        truck_id: data.id.toString(),
      });
      console.log('[TruckSetup] Navigating to visibility wizard');
      router.replace('/(truck)/visibility-wizard?start=name' as any);
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
