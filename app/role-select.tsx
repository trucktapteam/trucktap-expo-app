import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { User, Truck } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';

export default function RoleSelectScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const { isOwner } = useApp();

  const handleRoleSelect = (role: 'customer' | 'truck') => {
    if (role === 'customer') {
      router.replace('/(customer)/(tabs)/discover' as any);
    } else {
      if (isAuthenticated && isOwner) {
        router.replace('/(truck)/(tabs)/dashboard' as any);
      } else {
        router.push('/truck-login' as any);
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>I am a...</Text>
        
        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={[styles.optionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
            onPress={() => handleRoleSelect('customer')}
          >
            <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
              <User size={48} color={colors.primary} strokeWidth={2} />
            </View>
            <Text style={[styles.optionTitle, { color: colors.text }]}>Customer</Text>
            <Text style={[styles.optionDescription, { color: colors.secondaryText }]}>
              Find and follow amazing food trucks
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
            onPress={() => handleRoleSelect('truck')}
          >
            <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
              <Truck size={48} color={colors.primary} strokeWidth={2} />
            </View>
            <Text style={[styles.optionTitle, { color: colors.text }]}>Food Truck Owner</Text>
            <Text style={[styles.optionDescription, { color: colors.secondaryText }]}>
              Manage your truck and connect with customers
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  title: {
    fontSize: 36,
    fontWeight: '700' as const,
    marginBottom: 48,
    textAlign: 'center',
  },
  optionsContainer: {
    gap: 20,
  },
  optionCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  optionTitle: {
    fontSize: 24,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  optionDescription: {
    fontSize: 16,
    textAlign: 'center',
  },
});
