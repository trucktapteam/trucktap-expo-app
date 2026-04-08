import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { error: routeError } = useLocalSearchParams();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const hasRecoveryError = routeError === 'recovery_failed';

  const handleUpdatePassword = async () => {
    setFormError(null);

    if (!password.trim()) {
      setFormError('Enter a new password.');
      return;
    }

    if (password.length < 6) {
      setFormError('Use at least 6 characters for your new password.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    try {
      setIsSubmitting(true);
      const success = await updatePassword(password);

      if (success) {
        router.replace('/customer-login' as any);
      }
    } catch (err: any) {
      console.log('[ResetPassword] Update password error:', err);
      setFormError(err?.message || 'Unable to update your password right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>
            {hasRecoveryError
              ? 'That password reset link is invalid or has expired. Request a new reset email from the sign-in screen and try again.'
              : 'Enter a new password for your account, then sign in with the updated password.'}
          </Text>

          {hasRecoveryError ? null : (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>New password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter a new password"
                  placeholderTextColor={Colors.gray}
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setFormError(null);
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password-new"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirm password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter your new password"
                  placeholderTextColor={Colors.gray}
                  value={confirmPassword}
                  onChangeText={(value) => {
                    setConfirmPassword(value);
                    setFormError(null);
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password-new"
                />
              </View>
            </>
          )}

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          {hasRecoveryError ? null : (
            <TouchableOpacity
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={handleUpdatePassword}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={Colors.light} />
              ) : (
                <Text style={styles.buttonText}>Save new password</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={() => router.replace('/customer-login' as any)}>
            <Text style={styles.linkText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.dark,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.gray,
    textAlign: 'center',
    marginBottom: 32,
  },
  fieldGroup: {
    gap: 8,
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark,
  },
  input: {
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.dark,
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: Colors.light,
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 12,
    fontSize: 14,
  },
  linkText: {
    color: Colors.primary,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
  },
});
