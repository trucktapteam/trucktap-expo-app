import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Truck, ArrowLeft, Mail, } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';

export default function CustomerLoginScreen() {
  const router = useRouter();
  const { completeOnboarding, consumePendingRedirect } = useApp();
  const {
    signInWithEmail,
    signUpWithEmail,
    resetPasswordForEmail,
    isAuthenticated,
    isLoading: authLoading,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const { mode } = useLocalSearchParams();
 const [isSignUp, setIsSignUp] = useState(mode === 'signup');

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      console.log('[CustomerLogin] Authenticated, navigating');
      completeOnboarding();
      const pendingRoute = consumePendingRedirect();
      if (pendingRoute) {
        router.replace(pendingRoute as any);
      } else {
        router.replace('/(customer)/(tabs)/discover' as any);
      }
    }
  }, [isAuthenticated, authLoading]);

  const handleEmailLogin = async () => {
  setEmailTouched(true);
  setPasswordTouched(true);
  setError(null);
  setSuccessMessage(null);

  if (!email.trim()) {
    setError('Please enter your email address.');
    return;
  }

  if (!password.trim()) {
    setError('Please enter your password.');
    return;
  }

  try {
    setIsSubmitting(true);

    if (isSignUp) {
      const success = await signUpWithEmail(email, password);

    if (success) {
  setSuccessMessage('Account created successfully. Please sign in with your new email and password.');
  setIsSignUp(false);
  setPassword('');
}
    } else {
      await signInWithEmail(email, password);
    }
  } catch (error: any) {
    console.log('[CustomerLogin] Email auth error:', error);
    setError(error?.message || 'Something went wrong. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
};

  const handleForgotPassword = async () => {
    setEmailTouched(true);
    setError(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setError('Enter your email address first so we can send the reset link.');
      return;
    }

    try {
      setIsSubmitting(true);
      const success = await resetPasswordForEmail(email);

      if (success) {
        setSuccessMessage('Password reset email sent. Check your inbox and spam folder.');
      }
    } catch (error: any) {
      console.log('[CustomerLogin] Forgot password error:', error);
      setError(error?.message || 'Unable to send reset email right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
   // Google login temporarily hidden for MVP
// const handleGoogleLogin = async () => {
//   try {
//     setIsSubmitting(true);
//     await signInWithGoogle();
//   } catch (error) {
//     console.log('[CustomerLogin] Google login error:', error);
//   } finally {
//     setIsSubmitting(false);
//   }
// };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color={Colors.dark} />
          </TouchableOpacity>

          <View style={styles.header}>
          <View style={styles.iconContainer}>
  <Image
    source={require('@/assets/images/icon.png')}
    style={styles.logo}
    resizeMode="contain"
  />
</View>
           <Text style={styles.title}>
  {isSignUp ? 'Create Account' : 'Welcome Back'}
</Text>
           <Text style={styles.subtitle}>
  {isSignUp
    ? 'Create your account to review trucks and save favorites.'
    : 'Find amazing food trucks near you!'}
</Text>
          </View>

          <View style={styles.form}>
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {successMessage ? (
              <View style={styles.successBanner}>
                <Text style={styles.successText}>{successMessage}</Text>
              </View>
            ) : null}
           {/* Google login temporarily hidden for MVP
<TouchableOpacity
  style={styles.googleButton}
  onPress={handleGoogleLogin}
>
  <LinearGradient
    colors={['#4285F4', '#34A853']}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={styles.googleGradient}
  >
    <View style={styles.googleIconBox}>
      <Text style={styles.googleIcon}>G</Text>
    </View>
    <Text style={styles.googleButtonText}>Continue with Google</Text>
  </LinearGradient>
</TouchableOpacity>
*/}
            {/* Google login temporarily hidden for MVP
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>
            */}

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, emailTouched && !email.trim() && styles.inputError]}
                placeholder="your@email.com"
                placeholderTextColor={Colors.gray}
                value={email}
                onChangeText={(t) => { setEmail(t); setError(null); setSuccessMessage(null); }}
                onBlur={() => setEmailTouched(true)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
              {emailTouched && !email.trim() ? (
                <Text style={styles.fieldError}>Email is required</Text>
              ) : null}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={[styles.input, passwordTouched && !password.trim() && styles.inputError]}
                placeholder="Enter your password"
                placeholderTextColor={Colors.gray}
                value={password}
                onChangeText={(t) => { setPassword(t); setError(null); setSuccessMessage(null); }}
                onBlur={() => setPasswordTouched(true)}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
              />
              {passwordTouched && !password.trim() ? (
                <Text style={styles.fieldError}>Password is required</Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.forgotPassword, isSubmitting && styles.forgotPasswordDisabled]}
              onPress={handleForgotPassword}
              disabled={isSubmitting}
            >
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.loginButton, (isSubmitting || !email.trim() || !password.trim()) && { opacity: 0.6 }]}
              onPress={handleEmailLogin}
              disabled={isSubmitting || !email.trim() || !password.trim()}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={Colors.light} />
              ) : (
                <Mail size={20} color={Colors.light} style={styles.buttonIcon} />
              )}
             <Text style={styles.loginButtonText}>
  {isSubmitting
    ? isSignUp
      ? 'Creating Account...'
      : 'Signing in...'
    : isSignUp
      ? 'Create Account'
      : 'Sign in with Email'}
</Text>
            </TouchableOpacity>

          <View style={styles.signupContainer}>
  <Text style={styles.signupText}>
    {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
  </Text>

  <TouchableOpacity
    onPress={() => {
      setError(null);
      setSuccessMessage(null);
      setIsSignUp(!isSignUp);
    }}
  >
    <Text style={styles.signupLink}>
      {isSignUp ? 'Sign in' : 'Sign up'}
    </Text>
  </TouchableOpacity>
</View>
          </View>

          <View style={styles.authInfo}>
            <Text style={styles.authInfoTitle}>Secure Sign In</Text>
            <Text style={styles.authInfoText}>
            Sign in securely with your email and password to access your account.
           </Text>
          </View>
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
  logo: {
  width: 150,
  height: 150,
},
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `#FFF`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#000',
shadowOffset: { width: 0, height: 4 },
shadowOpacity: 0.15,
shadowRadius: 6,
elevation: 5,
  },
  title: {
    fontSize: 32,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: Colors.gray,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  form: {
    gap: 20,
  },
  googleButton: {
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  googleGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  googleIconBox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: Colors.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIcon: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.light,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.lightGray,
  },
  dividerText: {
    fontSize: 14,
    color: Colors.gray,
    fontWeight: '500' as const,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
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
  forgotPassword: {
    alignSelf: 'flex-end',
  },
  forgotPasswordText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  loginButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    elevation: 2,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonIcon: {
    marginRight: 4,
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.light,
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  signupText: {
    fontSize: 15,
    color: Colors.gray,
  },
  signupLink: {
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  authInfo: {
    marginTop: 40,
    padding: 16,
    backgroundColor: `${Colors.primary}10`,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  authInfoTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 6,
  },
  authInfoText: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 20,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '500' as const,
    textAlign: 'center' as const,
  },
  successBanner: {
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  successText: {
    color: '#15803D',
    fontSize: 14,
    fontWeight: '500' as const,
    textAlign: 'center' as const,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  fieldError: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 2,
  },
  forgotPasswordDisabled: {
    opacity: 0.6,
  },
});
