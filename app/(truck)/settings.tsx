import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform, Switch } from 'react-native';
import { User, LogOut, Bell, MapPin, MessageSquare, Mail, Trash2, ChevronRight, AlertCircle, ArrowLeft, Archive, ArchiveRestore } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAccountDeletion } from '@/hooks/useAccountDeletion';
import { useNotifications } from '@/contexts/NotificationContext';
import { supabase } from '@/lib/supabase';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';
import { fetchPrivateProfile } from '@/lib/privateProfile';

type OwnerNotificationPreferences = {
  favorites: boolean;
  reviews: boolean;
};

const DEFAULT_OWNER_NOTIFICATION_PREFS: OwnerNotificationPreferences = {
  favorites: true,
  reviews: true,
};
const FACEBOOK_URL = 'https://www.facebook.com/TruckTap';
const INSTAGRAM_URL = 'https://www.instagram.com/trucktapapp';
const TIKTOK_URL = 'https://www.tiktok.com/@trucktap';

export default function TruckSettings() {
  const {
    currentUser,
    logout,
    setCurrentUser,
    getUserTruck,
    updateTruckDetails,
    goOffline,
    foodTrucks,
    selectedAdminTruckId,
  } = useApp();
  const { user: authUser } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const { permissionStatus: notificationStatus, requestPermission, registerPushToken } = useNotifications();
  const [locationStatus, setLocationStatus] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const [ownerNotificationPrefs, setOwnerNotificationPrefs] =
    useState<OwnerNotificationPreferences>(DEFAULT_OWNER_NOTIFICATION_PREFS);
  const [savingOwnerNotificationKey, setSavingOwnerNotificationKey] =
    useState<keyof OwnerNotificationPreferences | null>(null);
  const [isUpdatingArchive, setIsUpdatingArchive] = useState(false);
  const { isDeletingAccount, confirmDeleteAccount } = useAccountDeletion({
    source: 'truck-settings',
  });
  useTruckLifecycleLogger('TruckSettings');

  const ownerTruck = getUserTruck();
  const isAdmin = currentUser?.role === 'admin';
  const selectedAdminTruck = foodTrucks.find(t => t.id === selectedAdminTruckId) ?? null;
  const selectedAdminTruckIsOwned =
    isAdmin && !!selectedAdminTruck && !!currentUser?.id && selectedAdminTruck.owner_id === currentUser.id;
  const truck = isAdmin && selectedAdminTruck ? selectedAdminTruck : ownerTruck;
  const isArchived = truck ? (truck.archived === true || !!truck.archivedAt) : false;
  const canManageArchive = !!truck && (!isAdmin || !selectedAdminTruck || selectedAdminTruckIsOwned);

  useEffect(() => {
    checkLocationPermission();
  }, []);

  useEffect(() => {
    const loadOwnerNotificationPreferences = async () => {
      if (!authUser?.id) return;

      try {
        const { data, error } = await fetchPrivateProfile(authUser.id);

        if (error) {
          console.log('Error loading owner notification preferences:', error.message);
          return;
        }

        setOwnerNotificationPrefs({
          favorites: data?.notify_owner_favorites ?? true,
          reviews: data?.notify_owner_reviews ?? true,
        });
      } catch (error) {
        console.log('Unexpected owner notification preference load error:', error);
      }
    };

    void loadOwnerNotificationPreferences();
  }, [authUser?.id]);

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

  const toggleOwnerNotificationPreference = async (
    key: keyof OwnerNotificationPreferences,
    value: boolean
  ) => {
    if (!authUser?.id) {
      Alert.alert('Sign In Required', 'Please sign in to update truck notification settings.');
      return;
    }

    if (value) {
      let granted = notificationStatus === 'granted';

      if (!granted) {
        granted = await requestPermission();
        if (!granted) return;
      }

      await registerPushToken();
    }

    const previousPrefs = ownerNotificationPrefs;
    const nextPrefs = {
      ...ownerNotificationPrefs,
      [key]: value,
    };

    const column =
      key === 'favorites' ? 'notify_owner_favorites' : 'notify_owner_reviews';

    setOwnerNotificationPrefs(nextPrefs);
    setSavingOwnerNotificationKey(key);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [column]: value })
        .eq('id', authUser.id);

      if (error) {
        console.log('Error saving owner notification preference:', error.message);
        setOwnerNotificationPrefs(previousPrefs);
        Alert.alert(
          'Setting Not Saved',
          'Truck notification preferences are not available yet. Please try again after the database update is applied.'
        );
      }
    } catch (error) {
      console.log('Unexpected owner notification preference save error:', error);
      setOwnerNotificationPrefs(previousPrefs);
      Alert.alert('Setting Not Saved', 'Unable to update notification settings right now.');
    } finally {
      setSavingOwnerNotificationKey(null);
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
  role: currentUser?.role === 'admin' ? 'admin' as const : 'customer' as const,
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

  const handleArchiveTruck = () => {
    if (!truck || !canManageArchive || isUpdatingArchive) return;

    Alert.alert(
      'Archive Truck',
      'This will hide your truck from customers. You can restore it anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            setIsUpdatingArchive(true);
            try {
              await goOffline({
                truckId: truck.id,
                source: 'archive',
                updates: {
                  archived: true,
                  archivedAt: new Date().toISOString(),
                  archiveReason: 'owner_archived',
                },
              });
              Alert.alert('Truck archived', 'Your truck is hidden from customers.');
            } catch (error: any) {
              console.log('[TruckSettings] Archive truck failed:', error?.message);
              Alert.alert('Could not archive truck', 'Please try again.');
            } finally {
              setIsUpdatingArchive(false);
            }
          },
        },
      ]
    );
  };

  const handleRestoreTruck = async () => {
    if (!truck || !canManageArchive || isUpdatingArchive) return;

    setIsUpdatingArchive(true);
    try {
      await updateTruckDetails(truck.id, {
        archived: false,
        archivedAt: undefined,
        archiveReason: undefined,
        lastOwnerActivityAt: Date.now(),
      });
      Alert.alert('Truck restored', 'Your truck can appear to customers again.');
    } catch (error: any) {
      console.log('[TruckSettings] Restore truck failed:', error?.message);
      Alert.alert('Could not restore truck', 'Please try again.');
    } finally {
      setIsUpdatingArchive(false);
    }
  };

  const handleReportBug = () => {
    const email = 'support@trucktap.app';
    const subject = 'Bug Report - TruckTap';
    const body = `\n\n---\nUser: ${currentUser?.name || 'Unknown'}\nRole: ${currentUser?.role || 'Unknown'}\nVersion: 1.0.50`;
    
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const handleSendFeedback = () => {
    const email = 'support@trucktap.app';
    const subject = 'Feedback - TruckTap';
    const body = `\n\n---\nUser: ${currentUser?.name || 'Unknown'}\nRole: ${currentUser?.role || 'Unknown'}`;
    
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const handleOpenSocialLink = (url: string) => {
    Linking.openURL(url).catch((error) => {
      console.log('Error opening social link:', error);
      Alert.alert('Error', 'Unable to open that link right now.');
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Messages</Text>
          <TouchableOpacity 
            style={[styles.settingItem, { backgroundColor: colors.cardBackground }]} 
            onPress={() => router.push('/(truck)/owner-updates' as any)}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}15` }]}>
                <Bell size={20} color={colors.primary} />
              </View>
              <Text style={[styles.settingText, { color: colors.text }]}>Message Center</Text>
            </View>
            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Truck notifications</Text>

          <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Bell size={20} color={colors.secondaryText} />
                <View style={styles.settingTextWrap}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>New favorites</Text>
                  <Text style={[styles.settingHelper, { color: colors.secondaryText }]}>Get notified when someone favorites your truck</Text>
                </View>
              </View>
              <Switch
                value={ownerNotificationPrefs.favorites}
                onValueChange={(value) => void toggleOwnerNotificationPreference('favorites', value)}
                disabled={savingOwnerNotificationKey === 'favorites'}
                trackColor={{ false: colors.border, true: colors.primary }}
                ios_backgroundColor={colors.border}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Bell size={20} color={colors.secondaryText} />
                <View style={styles.settingTextWrap}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>New reviews</Text>
                  <Text style={[styles.settingHelper, { color: colors.secondaryText }]}>Get notified when someone reviews your truck</Text>
                </View>
              </View>
              <Switch
                value={ownerNotificationPrefs.reviews}
                onValueChange={(value) => void toggleOwnerNotificationPreference('reviews', value)}
                disabled={savingOwnerNotificationKey === 'reviews'}
                trackColor={{ false: colors.border, true: colors.primary }}
                ios_backgroundColor={colors.border}
              />
            </View>
          </View>

          {notificationStatus === 'denied' && (
            <View style={[styles.noticeCard, { backgroundColor: `${colors.error}10` }]}>
              <AlertCircle size={16} color={colors.error} />
              <Text style={[styles.noticeText, { color: colors.error }]}>Notifications are disabled. Enable them in your device settings to receive truck alerts.</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Truck management</Text>

          <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <View style={styles.infoLeft}>
                <Archive size={20} color={colors.secondaryText} />
                <Text style={[styles.infoLabel, { color: colors.text }]}>Customer visibility</Text>
              </View>
              <Text style={[styles.infoValue, { color: isArchived ? colors.error : colors.secondaryText }]}>
                {isArchived ? 'Archived' : 'Visible'}
              </Text>
            </View>
          </View>

          {isArchived ? (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
              onPress={handleRestoreTruck}
              disabled={!canManageArchive || isUpdatingArchive}
            >
              <ArchiveRestore size={20} color={colors.primary} />
              <Text style={[styles.actionButtonText, { color: colors.primary }]}>Restore Truck</Text>
              <ChevronRight size={20} color={colors.primary} style={styles.chevron} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.dangerButton, { backgroundColor: `${colors.error}08`, borderColor: `${colors.error}20` }]}
              onPress={handleArchiveTruck}
              disabled={!canManageArchive || isUpdatingArchive}
            >
              <Archive size={20} color={colors.error} />
              <Text style={[styles.dangerButtonText, { color: colors.error }]}>Archive Truck</Text>
              <ChevronRight size={20} color={colors.error} style={styles.chevron} />
            </TouchableOpacity>
          )}
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
                {currentUser?.role === 'admin'
                  ? 'Admin'
                  : currentUser?.role === 'truck'
                  ? 'Truck Owner'
                  : 'Customer'}
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
              {currentUser?.role === 'admin'
                ? 'Location is used to review and manage truck activity'
                : currentUser?.role === 'truck'
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

          <View style={[styles.card, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.followTitle, { color: colors.text }]}>Follow TruckTap</Text>

            <TouchableOpacity style={styles.socialRow} onPress={() => handleOpenSocialLink(FACEBOOK_URL)}>
              <View style={styles.socialLeft}>
                <Ionicons name="logo-facebook" size={20} color={colors.primary} />
                <Text style={[styles.socialText, { color: colors.primary }]}>Facebook</Text>
              </View>
              <ChevronRight size={20} color={colors.primary} style={styles.chevron} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity style={styles.socialRow} onPress={() => handleOpenSocialLink(INSTAGRAM_URL)}>
              <View style={styles.socialLeft}>
                <Ionicons name="logo-instagram" size={20} color={colors.primary} />
                <Text style={[styles.socialText, { color: colors.primary }]}>Instagram</Text>
              </View>
              <ChevronRight size={20} color={colors.primary} style={styles.chevron} />
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity style={styles.socialRow} onPress={() => handleOpenSocialLink(TIKTOK_URL)}>
              <View style={styles.socialLeft}>
                <Ionicons name="logo-tiktok" size={20} color={colors.primary} />
                <Text style={[styles.socialText, { color: colors.primary }]}>TikTok</Text>
              </View>
              <ChevronRight size={20} color={colors.primary} style={styles.chevron} />
            </TouchableOpacity>
          </View>
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
              <Text style={[styles.aboutValue, { color: colors.secondaryText }]}>v1.0.50</Text>
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
  followTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  socialLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  socialText: {
    fontSize: 16,
    fontWeight: '500' as const,
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
