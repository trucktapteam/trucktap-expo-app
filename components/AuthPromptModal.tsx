import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { LogIn, Heart, Star, UserPlus } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';

interface AuthPromptModalProps {
  visible: boolean;
  onClose: () => void;
  action: string;
  returnRoute?: string;
}

export default function AuthPromptModal({ visible, onClose, action, returnRoute }: AuthPromptModalProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const { setPendingRedirect } = useApp();

  const getIcon = () => {
    if (action.includes('favorite')) return <Heart size={48} color={colors.primary} strokeWidth={1.5} />;
    if (action.includes('review')) return <Star size={48} color={colors.primary} strokeWidth={1.5} />;
    if (action.includes('follow')) return <UserPlus size={48} color={colors.primary} strokeWidth={1.5} />;
    return <LogIn size={48} color={colors.primary} strokeWidth={1.5} />;
  };

  const handleSignIn = () => {
    onClose();
    if (returnRoute) {
      setPendingRedirect(returnRoute);
    }
    router.push('/customer-login' as any);
  };

  const styles = createStyles(colors);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={styles.overlay}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} style={styles.container} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconContainer}>
            {getIcon()}
          </View>

          <Text style={styles.title}>Sign in to {action}</Text>
          <Text style={styles.subtitle}>
            Create a free account or sign in to {action}. It only takes a moment.
          </Text>

          <TouchableOpacity
            style={styles.signInButton}
            onPress={handleSignIn}
            activeOpacity={0.8}
          >
            <LogIn size={20} color={colors.background} />
            <Text style={styles.signInButtonText}>Sign In / Sign Up</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Maybe Later</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: colors.cardBackground,
    borderRadius: 24,
    padding: 28,
    marginHorizontal: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: colors.secondaryText,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: '100%',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.background,
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.secondaryText,
  },
});
