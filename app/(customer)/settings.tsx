import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert, Linking, Platform, Modal, Pressable } from 'react-native';
import { User, LogOut, Bell, MapPin, MessageSquare, Mail, Trash2, ChevronRight, AlertCircle, Truck, ChevronLeft, Sun, Moon, Smartphone } from 'lucide-react-native';
import * as Location from 'expo-location';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AuthPromptModal from '@/components/AuthPromptModal';
import { supabase } from '@/lib/supabase';
import { useAccountDeletion } from '@/hooks/useAccountDeletion';

export default function SettingsScreen() {
  const { currentUser, logout } = useApp();
  const { isAuthenticated, user: authUser } = useAuth();
  const { themeMode, setThemeMode, colors } = useTheme();
  const { permissionStatus: notifStatus, preferences: notifPrefs, togglePreference } = useNotifications();
  const router = useRouter();
  const [locationStatus, setLocationStatus] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authAction, setAuthAction] = useState<string>('');
  const { isDeletingAccount, confirmDeleteAccount } = useAccountDeletion({
    source: 'customer-settings',
    onRequireAuth: () => {
      setAuthAction('delete account');
      setShowAuthModal(true);
    },
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

  const sendTestNotification = async () => {
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      Alert.alert('Error', 'No logged-in user found.');
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', userData.user.id)
      .single();

    if (profileError || !profile?.push_token) {
      Alert.alert('Error', 'No push token found for this user.');
      return;
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: profile.push_token,
        sound: 'default',
        title: 'TruckTap Test',
        body: 'If you see this, push notifications are working.',
        data: { type: 'manual_test' },
      }),
    });

    const result = await response.json();
    console.log('[Test Notification] Expo status:', response.status);
    console.log('[Test Notification] Expo response:', result);

    if (response.ok) {
      Alert.alert('Sent', 'Test notification was sent. Check your phone.');
    } else {
      Alert.alert('Error', 'Expo did not accept the test notification.');
    }
  } catch (error) {
    console.log('[Test Notification] Error:', error);
    Alert.alert('Error', 'Something went wrong sending the test notification.');
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

  const handleLogout = () => {
    if (!isAuthenticated) {
      setAuthAction('logout');
      setShowAuthModal(true);
      return;
    }
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
    const body = `\n\n---\nUser: ${currentUser?.name || 'Unknown'}\nRole: ${currentUser?.role || 'Unknown'}\nVersion: 1.0.0`;
    
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const handleSendFeedback = () => {
    const email = 'support@trucktap.app';
    const subject = 'Feedback - TruckTap';
    const body = `\n\n---\nUser: ${currentUser?.name || 'Unknown'}\nRole: ${currentUser?.role || 'Unknown'}`;
    
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const handleSwitchToTruck = () => {
    Alert.alert(
      'Truck Owner?',
      'Are you a food truck owner looking to promote your business?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go to Truck Login',
          onPress: () => router.push('/truck-login' as any)
        }
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Appearance</Text>

          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: colors.cardBackground }]} 
            onPress={() => setShowThemeModal(true)}
          >
            <Sun size={20} color={colors.secondaryText} />
            <Text style={[styles.actionButtonText, { color: colors.text }]}>Theme</Text>
            <Text style={[styles.themeValue, { color: colors.secondaryText }]}>
              {themeMode === 'light' ? 'Light' : themeMode === 'dark' ? 'Dark' : 'System'}
            </Text>
            <ChevronRight size={20} color={colors.secondaryText} style={styles.chevron} />
          </TouchableOpacity>
        </View>

        <Modal
          visible={showThemeModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowThemeModal(false)}
        >
          <Pressable 
            style={styles.modalOverlay} 
            onPress={() => setShowThemeModal(false)}
          >
            <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Theme</Text>
              
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  setThemeMode('light');
                  setShowThemeModal(false);
                }}
              >
                <View style={styles.modalOptionLeft}>
                  <Sun size={20} color={colors.text} />
                  <Text style={[styles.modalOptionText, { color: colors.text }]}>Light</Text>
                </View>
                {themeMode === 'light' && (
                  <View style={[styles.checkmark, { backgroundColor: colors.primary }]} />
                )}
              </TouchableOpacity>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  setThemeMode('dark');
                  setShowThemeModal(false);
                }}
              >
                <View style={styles.modalOptionLeft}>
                  <Moon size={20} color={colors.text} />
                  <Text style={[styles.modalOptionText, { color: colors.text }]}>Dark</Text>
                </View>
                {themeMode === 'dark' && (
                  <View style={[styles.checkmark, { backgroundColor: colors.primary }]} />
                )}
              </TouchableOpacity>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  setThemeMode('system');
                  setShowThemeModal(false);
                }}
              >
                <View style={styles.modalOptionLeft}>
                  <Smartphone size={20} color={colors.text} />
                  <View>
                    <Text style={[styles.modalOptionText, { color: colors.text }]}>System</Text>
                    <Text style={[styles.modalOptionHelper, { color: colors.secondaryText }]}>
                      Match device settings
                    </Text>
                  </View>
                </View>
                {themeMode === 'system' && (
                  <View style={[styles.checkmark, { backgroundColor: colors.primary }]} />
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>

        {isAuthenticated && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Account</Text>
            
            <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
              <View style={styles.infoRow}>
                <View style={styles.infoLeft}>
                  <User size={20} color={colors.secondaryText} />
                  <Text style={[styles.infoLabel, { color: colors.text }]}>Account Type</Text>
                </View>
                <Text style={[styles.infoValue, { color: colors.secondaryText }]}>Customer</Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.infoRow}>
                <View style={styles.infoLeft}>
                  <Mail size={20} color={colors.secondaryText} />
                  <Text style={[styles.infoLabel, { color: colors.text }]}>Email</Text>
                </View>
                <Text style={[styles.infoValue, { color: colors.secondaryText }]}>{authUser?.email || 'Not set'}</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.cardBackground }]} onPress={handleLogout}>
              <LogOut size={20} color={Colors.error} />
              <Text style={styles.actionButtonText}>Log Out</Text>
              <ChevronRight size={20} color={Colors.error} style={styles.chevron} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Notifications</Text>

          <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Bell size={20} color={colors.secondaryText} />
                <View style={styles.settingText}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>Favorites are open</Text>
                  <Text style={[styles.settingHelper, { color: colors.secondaryText }]}>Get notified when your favorite trucks open</Text>
                </View>
              </View>
              <Switch
                value={notifPrefs.favoritesOpen}
                onValueChange={(val) => togglePreference('favoritesOpen', val)}
                trackColor={{ false: colors.border, true: colors.primary }}
                ios_backgroundColor={colors.border}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Bell size={20} color={colors.secondaryText} />
                <View style={styles.settingText}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>New trucks added</Text>
                  <Text style={[styles.settingHelper, { color: colors.secondaryText }]}>Get notified when new food trucks join TruckTap</Text>
                </View>
              </View>
              <Switch
                value={notifPrefs.newTrucksNearby}
                onValueChange={(val) => togglePreference('newTrucksNearby', val)}
                trackColor={{ false: colors.border, true: colors.primary }}
                ios_backgroundColor={colors.border}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Bell size={20} color={colors.secondaryText} />
                <View style={styles.settingText}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>Truck announcements</Text>
                  <Text style={[styles.settingHelper, { color: colors.secondaryText }]}>Updates from trucks you follow</Text>
                </View>
              </View>
              <Switch
                value={notifPrefs.truckAnnouncements}
                onValueChange={(val) => togglePreference('truckAnnouncements', val)}
                trackColor={{ false: colors.border, true: colors.primary }}
                ios_backgroundColor={colors.border}
              />
            </View>
          </View>

          {notifStatus === 'denied' && (
            <View style={[styles.noticeCard, { backgroundColor: `${Colors.error}10` }]}>
              <AlertCircle size={16} color={Colors.error} />
              <Text style={[styles.noticeText, { color: Colors.error }]}>Notifications are disabled. Enable them in your device settings to receive alerts.</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.testButton} onPress={sendTestNotification}>
  <Text style={styles.testButtonText}>Send test notification</Text>
</TouchableOpacity>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Location</Text>

          <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
            <TouchableOpacity style={styles.infoRow} onPress={openLocationSettings}>
              <View style={styles.infoLeft}>
                <MapPin size={20} color={colors.secondaryText} />
                <Text style={[styles.infoLabel, { color: colors.text }]}>Permission Status</Text>
              </View>
              <Text style={[
                styles.statusText,
                locationStatus === 'granted' && styles.statusGranted,
                locationStatus === 'denied' && styles.statusDenied
              ]}>
                {locationStatus === 'granted' ? 'Enabled' : locationStatus === 'denied' ? 'Disabled' : 'Unknown'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.cardBackground }]} onPress={openLocationSettings}>
            <MapPin size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>Change Location Permission</Text>
            <ChevronRight size={20} color={colors.primary} style={styles.chevron} />
          </TouchableOpacity>

          <View style={[styles.noticeCard, { backgroundColor: `${colors.secondaryText}15` }]}>
            <AlertCircle size={16} color={colors.secondaryText} />
            <Text style={[styles.noticeText, { color: colors.secondaryText }]}>
              Location is used to find food trucks near you and show distances
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Support & Feedback</Text>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.cardBackground }]} onPress={handleReportBug}>
            <MessageSquare size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>Report a Bug</Text>
            <ChevronRight size={20} color={colors.primary} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.cardBackground }]} onPress={handleSendFeedback}>
            <Mail size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>Send Feedback</Text>
            <ChevronRight size={20} color={colors.primary} style={styles.chevron} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text>

          <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.aboutRow}>
              <Text style={[styles.aboutLabel, { color: colors.text }]}>App Name</Text>
              <Text style={[styles.aboutValue, { color: colors.secondaryText }]}>TruckTap</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.aboutRow}>
              <Text style={[styles.aboutLabel, { color: colors.text }]}>Version</Text>
              <Text style={[styles.aboutValue, { color: colors.secondaryText }]}>1.0.26</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.aboutRow}>
              <Text style={[styles.aboutValue, { color: colors.secondaryText }]}>Built for food trucks ❤️</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.truckOwnerButton, { backgroundColor: colors.cardBackground, borderColor: `${colors.primary}30` }]} onPress={handleSwitchToTruck}>
            <Truck size={20} color={colors.primary} />
            <Text style={[styles.truckOwnerButtonText, { color: colors.primary }]}>Are you a truck owner?</Text>
            <ChevronRight size={20} color={colors.primary} style={styles.chevron} />
          </TouchableOpacity>
        </View>

        {isAuthenticated && (
          <View style={styles.section}>
            <Text style={[styles.dangerZoneTitle, { color: colors.secondaryText }]}>Danger Zone</Text>
            
            <TouchableOpacity style={styles.subtleDeleteButton} onPress={confirmDeleteAccount} disabled={isDeletingAccount}>
              <Trash2 size={16} color={Colors.error} />
              <Text style={styles.subtleDeleteText}>Delete account</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>

      <AuthPromptModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        action={authAction}
        returnRoute="/(customer)/settings"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  testButton: {
  marginTop: 16,
  paddingVertical: 14,
  paddingHorizontal: 16,
  borderRadius: 10,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#222',
},

testButtonText: {
  color: '#fff',
  fontSize: 16,
  fontWeight: '600',
},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
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
    backgroundColor: `${Colors.primary}15`,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  comingSoonText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
    color: Colors.error,
  },
  chevron: {
    opacity: 0.5,
  },
  dangerZoneTitle: {
    fontSize: 14,
    fontWeight: '500' as const,
    marginBottom: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  subtleDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  subtleDeleteText: {
    fontSize: 14,
    color: Colors.error,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    marginTop: 24,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center' as const,
    lineHeight: 22,
    marginBottom: 32,
  },
  loginButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
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
  statusDenied: {
    color: Colors.error,
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
  truckOwnerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  truckOwnerButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500' as const,
  },
  bottomSpacing: {
    height: 40,
  },
  themeValue: {
    fontSize: 16,
    marginRight: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    marginBottom: 16,
    textAlign: 'center' as const,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  modalOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  modalOptionHelper: {
    fontSize: 13,
    marginTop: 2,
  },
  checkmark: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
});
