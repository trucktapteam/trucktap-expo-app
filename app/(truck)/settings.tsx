import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform } from 'react-native';
import { User, LogOut, Bell, MapPin, MessageSquare, Mail, Trash2, ChevronRight, AlertCircle, ArrowLeft } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAccountDeletion } from '@/hooks/useAccountDeletion';


export default function TruckSettings() {
  const { currentUser, logout, setCurrentUser } = useApp();
  const { user: authUser } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const [locationStatus, setLocationStatus] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const { isDeletingAccount, confirmDeleteAccount } = useAccountDeletion({
    source: 'truck-settings',
  });

  useEffect(() => {
    checkLocationPermission();
  }, []);

  const checkLocationPermission = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setLocationStatus(status === 'granted' ? 'granted' : 'denied');
    } catch (error) {
      console.log('Error checking location permission:', error);
      setLocationStatus('unknown');
    }
  };

  const openLocationSettings = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Location Settings',
        'To change location permissions on web, check your browser settings.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      await Linking.openSettings();
    } catch (error) {
      console.log('Error opening location settings:', error);
      Alert.alert('Error', 'Unable to open your device settings right now.');
    }
  };

  const handleExitOwnerMode = () => {
    Alert.alert(
      'Exit Owner Mode',
      'Switch back to customer mode?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch to Customer',
          onPress: () => {
          const customerUser = {
  ...(currentUser || {
    id: authUser?.id || `user-${Date.now()}`,
    name: authUser?.name || 'Customer',
    role: 'customer' as const,
    favorites: [],
  }),
  role: 'customer' as const,
};
setCurrentUser(customerUser);  
            router.replace('/(customer)/(tabs)/discover' as any);
          }
        }
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: () => {
            logout();
            router.replace('/');
          }
        }
      ]
    );
  };

  const handleReportBug = () => {
    const email = 'support@trucktap.app';
    const subject = 'Bug Report - TruckTap';
    const body = `\n\n---\nUser: ${currentUser?.name || 'Unknown'}\nRole: ${currentUser?.role || 'Unknown'}\nVersion: 1.0.33`;
    
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const handleSendFeedback = () => {
    const email = 'support@trucktap.app';
    const subject = 'Feedback - TruckTap';
    const body = `\n\n---\nUser: ${currentUser?.name || 'Unknown'}\nRole: ${currentUser?.role || 'Unknown'}`;
    
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Updates</Text>
          <TouchableOpacity 
            style={[styles.settingItem, { backgroundColor: colors.cardBackground }]} 
            onPress={() => router.push('/(truck)/owner-updates' as any)}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}15` }]}>
                <Bell size={20} color={colors.primary} />
              </View>
              <Text style={[styles.settingText, { color: colors.text }]}>Owner Updates</Text>
            </View>
            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Account</Text>
          
          <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <View style={styles.infoLeft}>
                <User size={20} color={colors.secondaryText} />
                <Text style={[styles.infoLabel, { color: colors.text }]}>Role</Text>
              </View>
              <Text style={[styles.infoValue, { color: colors.secondaryText }]}>
                {currentUser?.role === 'truck' ? 'Truck Owner' : 'Customer'}
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.infoRow}>
              <View style={styles.infoLeft}>
                <Mail size={20} color={colors.secondaryText} />
                <Text style={[styles.infoLabel, { color: colors.text }]}>Email</Text>
              </View>
              <Text style={[styles.infoValue, { color: colors.secondaryText }]}>{currentUser?.email || 'Not set'}</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} onPress={handleExitOwnerMode}>
            <ArrowLeft size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>Back to Customer Mode</Text>
            <ChevronRight size={20} color={colors.primary} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} onPress={handleLogout}>
            <LogOut size={20} color={colors.error} />
            <Text style={[styles.actionButtonText, { color: colors.error }]}>Log Out</Text>
            <ChevronRight size={20} color={colors.error} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.dangerButton, { backgroundColor: `${colors.error}08`, borderColor: `${colors.error}20` }]} onPress={confirmDeleteAccount} disabled={isDeletingAccount}>
            <Trash2 size={20} color={colors.error} />
            <Text style={[styles.dangerButtonText, { color: colors.error }]}>Delete Account</Text>
            <ChevronRight size={20} color={colors.error} style={styles.chevron} />
          </TouchableOpacity>
        </View>

        

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Location</Text>

          <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <TouchableOpacity style={styles.infoRow} onPress={openLocationSettings}>
              <View style={styles.infoLeft}>
                <MapPin size={20} color={colors.secondaryText} />
                <Text style={[styles.infoLabel, { color: colors.text }]}>Permission Status</Text>
              </View>
              <Text style={[
                styles.statusText,
                locationStatus === 'granted' && styles.statusGranted,
                locationStatus === 'denied' && { color: colors.error }
              ]}>
                {locationStatus === 'granted' ? 'Enabled' : locationStatus === 'denied' ? 'Disabled' : 'Unknown'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} onPress={openLocationSettings}>
            <MapPin size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>Change Location Permission</Text>
            <ChevronRight size={20} color={colors.primary} style={styles.chevron} />
          </TouchableOpacity>

          <View style={[styles.noticeCard, { backgroundColor: `${colors.secondaryText}10` }]}>
            <AlertCircle size={16} color={colors.secondaryText} />
            <Text style={[styles.noticeText, { color: colors.secondaryText }]}>
              {currentUser?.role === 'truck' 
                ? 'Location is used to update your truck position and show you to nearby customers'
                : 'Location is used to find food trucks near you and show distances'
              }
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Support & Feedback</Text>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} onPress={handleReportBug}>
            <MessageSquare size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>Report a Bug</Text>
            <ChevronRight size={20} color={colors.primary} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]} onPress={handleSendFeedback}>
            <Mail size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>Send Feedback</Text>
            <ChevronRight size={20} color={colors.primary} style={styles.chevron} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text>

          <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.aboutRow}>
              <Text style={[styles.aboutLabel, { color: colors.text }]}>App Name</Text>
              <Text style={[styles.aboutValue, { color: colors.secondaryText }]}>TruckTap</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.aboutRow}>
              <Text style={[styles.aboutLabel, { color: colors.text }]}>Version</Text>
              <Text style={[styles.aboutValue, { color: colors.secondaryText }]}>1.0.33</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.aboutRow}>
              <Text style={[styles.aboutValue, { color: colors.secondaryText }]}>Built for food trucks ❤️</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginBottom: 12,
  },
  comingSoonBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  comingSoonText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  infoValue: {
    fontSize: 16,
  },
  divider: {
    height: 1,
    marginVertical: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500' as const,
  },
  chevron: {
    opacity: 0.5,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  dangerButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500' as const,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingText: {
    flex: 1,
  },
  settingTextWrap: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500' as const,
    marginBottom: 2,
  },
  settingHelper: {
    fontSize: 13,
    opacity: 0.7,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 10,
    padding: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  statusGranted: {
    color: '#10b981',
  },
  aboutRow: {
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aboutLabel: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  aboutValue: {
    fontSize: 16,
  },
  bottomSpacing: {
    height: 40,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
