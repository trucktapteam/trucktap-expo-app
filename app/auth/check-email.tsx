import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';

export default function CheckEmailScreen() {
  const router = useRouter();
  const { email, error } = useLocalSearchParams();
  const { resendConfirmationEmail } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [enteredEmail, setEnteredEmail] = useState(typeof email === 'string' ? email : '');
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const emailValue = enteredEmail.trim();
  const hasVerificationError = error === 'verification_failed';

  const handleResend = async () => {
    if (!emailValue) {
      setLocalError('Enter your email address so we can resend the verification link.');
      setMessage(null);
      return;
    }

    try {
      setIsSubmitting(true);
      setLocalError(null);
      setMessage(null);

      const success = await resendConfirmationEmail(emailValue);

      if (success) {
        setMessage('Verification email sent. Check your inbox and spam folder.');
      }
    } catch (err: any) {
      console.log('[CheckEmail] Resend error:', err);
      setLocalError(err?.message || 'Unable to resend verification email right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToSignIn = () => {
    router.replace('/customer-login' as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Mail size={40} color={Colors.primary} />
        </View>

        <Text style={styles.title}>
          {hasVerificationError ? 'Verification link issue' : 'Check your email'}
        </Text>

        <Text style={styles.subtitle}>
          {hasVerificationError
            ? 'Use your account email to request a fresh verification link:'
            : 'We sent a confirmation link to:'}
        </Text>

        {hasVerificationError ? (
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor={Colors.gray}
            value={enteredEmail}
            onChangeText={(value) => {
              setEnteredEmail(value);
              setLocalError(null);
              setMessage(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        ) : (
          <Text style={styles.email}>{emailValue || 'your email address'}</Text>
        )}

        <Text style={styles.helperText}>
          {hasVerificationError
            ? 'That verification link may have expired, already been used, or is invalid. You can request a new verification email below.'
            : 'Open the email, tap the confirmation link, and return to TruckTap. If you do not see it, check your spam folder.'}
        </Text>

        {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
        {message ? <Text style={styles.successText}>{message}</Text> : null}

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleResend}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.light} />
          ) : (
            <Text style={styles.buttonText}>Resend verification email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleBackToSignIn}>
          <Text style={styles.linkText}>Back to sign in</Text>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  email: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: 16,
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
    marginBottom: 16,
  },
  helperText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
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
  successText: {
    color: '#15803D',
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
