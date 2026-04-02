import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Share, Alert, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { MapPin, Utensils, Pencil, Settings, Clock, Image as ImageIcon, BarChart3, Megaphone, QrCode, Share2, FileImage, ScanLine, CheckCircle2, X, AlertCircle, Eye, Link, Sparkles, Bell, Archive, ArchiveRestore } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp, useTruckMenu, useTruckRating } from '@/contexts/AppContext';
import * as Clipboard from 'expo-clipboard';
import HeaderCard from '@/components/HeaderCard';
import StatsRow from '@/components/StatsRow';
import DashboardCard from '@/components/DashboardCard';
import Toast from '@/components/Toast';
import { DEBUG } from '@/constants/debug';

const formatLastScanned = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export default function TruckDashboard() {
  const SHOW_QR_TOOLS = false;
  const router = useRouter();
  const { getUserTruck, updateTruckDetails, getQrScanStats, checklistDismissed, dismissChecklist, hasHoursSet, isProfileComplete, hasUnreadOwnerUpdates, qrShared } = useApp();
  const truck = getUserTruck();
  const [isOpen, setIsOpen] = useState(truck?.open_now || false);
  const [toastVisible, setToastVisible] = useState(false);
  const [statusToast, setStatusToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({ visible: false, message: '', type: 'success' });
  
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerTranslateY = useRef(new Animated.Value(-5)).current;
  
  const qrStats = truck ? getQrScanStats(truck.id) : { totalScans: 0, lastScanned: undefined };

  const menuItems = useTruckMenu(truck?.id || '');
  const rating = useTruckRating(truck?.id || '');

  const truckOpenNow = truck?.open_now ?? false;
  useEffect(() => {
    if (DEBUG) console.log('[Dashboard] Truck open_now changed:', truckOpenNow);
    setIsOpen(truckOpenNow);
  }, [truckOpenNow]);

  const hoursSet = truck ? hasHoursSet(truck.id) : false;
  const hasPhotos = !!(truck && truck.images.length > 0);
  const hasMenu = menuItems.length > 0;
  const hasSharedQr = qrShared;
  const hasUnread = hasUnreadOwnerUpdates();

  useEffect(() => {
    if (truck) {
      if (DEBUG) console.log('[Checklist] hoursSet:', hoursSet, 'hasMenu:', hasMenu, 'hasPhotos:', hasPhotos, 'hasSharedQr:', hasSharedQr);
    }
  }, [truck, hoursSet, hasMenu, hasPhotos, hasSharedQr, menuItems.length]);

  const showChecklist = !checklistDismissed && (!hasMenu || !hasPhotos || !hoursSet);

  const handleToggleStatus = async (value: boolean) => {
    if (!truck) return;
    if (DEBUG) console.log('[Dashboard] handleToggleStatus:', value);
    setIsOpen(value);
    
    try {
      await updateTruckDetails(truck.id, { open_now: value });

    } catch (error: any) {
      console.log('[Dashboard] Toggle status failed:', error?.message);
      setIsOpen(!value);
    }
    
    const toastMessage = value ? "You're live on the map." : "You're hidden from customers.";
    setStatusToast({
      visible: true,
      message: toastMessage,
      type: 'success'
    });
  };

  const profileComplete = truck ? isProfileComplete(truck.id) : false;
  const profileUrl = `https://trucktap.app/truck/${truck?.id}`;

  const isArchived = truck ? (truck.archived === true || !!truck.archivedAt) : false;

  useEffect(() => {
    if (isArchived) {
      Animated.parallel([
        Animated.timing(bannerOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(bannerTranslateY, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      bannerOpacity.setValue(0);
      bannerTranslateY.setValue(-5);
    }
  }, [isArchived, bannerOpacity, bannerTranslateY]);

  const showToast = () => {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  const handleCopyLink = async () => {
    if (!truck) return;
    try {
      await Clipboard.setStringAsync(profileUrl);
      showToast();
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleShareProfile = async () => {
    if (!truck) return;
    try {
      await Share.share({
        message: `Check out ${truck.name} on TruckTap! ${profileUrl}`,
        url: profileUrl,
        title: `${truck.name} - TruckTap`,
      });
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  const handleShareQR = () => {
    if (!truck) return;
    router.push('/(truck)/qr' as any);
  };

  const handleArchiveTruck = () => {
    if (!truck) return;
    Alert.alert(
      'Archive Truck',
      'This will hide your truck from customers. You can restore it anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            await updateTruckDetails(truck.id, {
              archived: true,
              archivedAt: Date.now(),
              archiveReason: 'owner_archived',
              open_now: false,
            });
            setIsOpen(false);
            setStatusToast({
              visible: true,
              message: 'Truck archived successfully',
              type: 'success'
            });
          }
        }
      ]
    );
  };

  const handleRestoreTruck = () => {
    if (!truck) return;
    void updateTruckDetails(truck.id, {
      archived: false,
      archivedAt: undefined,
      archiveReason: undefined,
      lastOwnerActivityAt: Date.now(),
    });
    setStatusToast({
      visible: true,
      message: 'Truck restored successfully',
      type: 'success'
    });
  };

  if (!truck) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Truck not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HeaderCard 
        truckName={truck.name}
        cuisineType={truck.cuisine_type}
        logoUrl={truck.logo}
        isOpen={isOpen}
      />

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {isArchived && (
          <Animated.View 
            style={[
              styles.archiveBanner,
              {
                opacity: bannerOpacity,
                transform: [{ translateY: bannerTranslateY }],
              }
            ]}
          >
            <View style={styles.archiveBannerContent}>
              <AlertCircle size={20} color={Colors.error} />
              <View style={styles.archiveBannerText}>
                <Text style={styles.archiveBannerTitle}>Truck Archived</Text>
                <Text style={styles.archiveBannerSubtitle}>This truck is hidden from customers</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestoreTruck}
              activeOpacity={0.7}
            >
              <ArchiveRestore size={18} color="#fff" />
              <Text style={styles.restoreButtonText}>Restore Truck</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {showChecklist && (
          <View style={styles.checklistCard}>
            <View style={styles.checklistHeader}>
              <Text style={styles.checklistTitle}>Getting Started</Text>
              <TouchableOpacity 
                onPress={dismissChecklist}
                style={styles.checklistDismiss}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={Colors.gray} />
              </TouchableOpacity>
            </View>
            <Text style={styles.checklistSubtitle}>Complete these steps to get the most out of TruckTap</Text>
            
            <View style={styles.checklistItems}>
              <TouchableOpacity 
                style={styles.checklistItem}
                onPress={() => router.push('/(truck)/menu-editor' as any)}
                disabled={hasMenu}
              >
                <View style={[styles.checklistIcon, hasMenu && styles.checklistIconComplete]}>
                  {hasMenu ? (
                    <CheckCircle2 size={20} color={Colors.success} />
                  ) : (
                    <View style={styles.checklistIconEmpty} />
                  )}
                </View>
                <Text style={[styles.checklistItemText, hasMenu && styles.checklistItemTextComplete]}>
                  Add menu
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.checklistItem}
                onPress={() => router.push('/(truck)/gallery' as any)}
                disabled={hasPhotos}
              >
                <View style={[styles.checklistIcon, hasPhotos && styles.checklistIconComplete]}>
                  {hasPhotos ? (
                    <CheckCircle2 size={20} color={Colors.success} />
                  ) : (
                    <View style={styles.checklistIconEmpty} />
                  )}
                </View>
                <Text style={[styles.checklistItemText, hasPhotos && styles.checklistItemTextComplete]}>
                  Upload photos
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.checklistItem}
                onPress={() => router.push('/(truck)/operating-hours' as any)}
                disabled={hoursSet}
              >
                <View style={[styles.checklistIcon, hoursSet && styles.checklistIconComplete]}>
                  {hoursSet ? (
                    <CheckCircle2 size={20} color={Colors.success} />
                  ) : (
                    <View style={styles.checklistIconEmpty} />
                  )}
                </View>
                <Text style={[styles.checklistItemText, hoursSet && styles.checklistItemTextComplete]}>
                  Set hours
                </Text>
              </TouchableOpacity>
                   
            {SHOW_QR_TOOLS && (
              <TouchableOpacity 
                style={styles.checklistItem}
                onPress={() => router.push('/(truck)/qr' as any)}
                disabled={hasSharedQr}
              >
                <View style={[styles.checklistIcon, hasSharedQr && styles.checklistIconComplete]}>
                  {hasSharedQr ? (
                    <CheckCircle2 size={20} color={Colors.success} />
                  ) : (
                    <View style={styles.checklistIconEmpty} />
                  )}
                </View>
                <Text style={[styles.checklistItemText, hasSharedQr && styles.checklistItemTextComplete]}>
                  Share QR code
                </Text>
              </TouchableOpacity>
            )}
            </View>
          </View>
        )}

        <View style={styles.toggleCard}>
          <View style={styles.toggleLeft}>
            <Text style={styles.toggleTitle}>Truck Status</Text>
            <Text style={styles.toggleSubtitle}>
              {isArchived ? 'Archived (hidden from customers)' : isOpen ? 'Currently accepting orders' : 'Closed for business'}
            </Text>
          </View>
          <Switch
            value={isOpen}
            onValueChange={handleToggleStatus}
            trackColor={{ false: Colors.gray, true: Colors.success }}
            thumbColor="#fff"
            ios_backgroundColor={Colors.gray}
            disabled={isArchived}
          />
        </View>

        <StatsRow 
          stats={{
            menuItems: menuItems.length,
            rating: rating.average || 0,
          }}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>

        <View style={styles.gridContainer}>
          <DashboardCard 
            icon={Pencil}
            label="Edit Profile"
            onPress={() => router.push('/(truck)/edit-profile' as any)}
          />
          <DashboardCard 
            icon={Utensils}
            label="Menu Editor"
            onPress={() => router.push('/(truck)/menu-editor' as any)}
          />
        </View>

        <View style={styles.gridContainer}>
          <DashboardCard 
            icon={ImageIcon}
            label="Gallery"
            onPress={() => router.push('/(truck)/gallery' as any)}
          />
          <DashboardCard 
            icon={MapPin}
            label="Location"
            onPress={() => router.push('/(truck)/update-location' as any)}
          />
        </View>

        <View style={styles.gridContainer}>
          <View style={styles.cardWithBadge}>
            <DashboardCard 
              icon={Clock}
              label="Operating Hours"
              onPress={() => router.push('/(truck)/operating-hours' as any)}
            />
            {!hoursSet && (
              <View style={styles.warningBadge}>
                <AlertCircle size={12} color={Colors.error} />
              </View>
            )}
          </View>
          <DashboardCard 
            icon={BarChart3}
            label="Analytics"
            onPress={() => router.push('/(truck)/analytics' as any)}
          />
        </View>

        <View style={styles.gridContainer}>
          <View style={styles.cardWithBadge}>
            <DashboardCard 
              icon={Bell}
              label="Owner Updates"
              onPress={() => router.push('/(truck)/owner-updates' as any)}
            />
            {hasUnread && (
              <View style={styles.notificationBadge} />
            )}
          </View>
          <DashboardCard 
            icon={Megaphone}
            label="Announcements"
            onPress={() => router.push('/(truck)/announcements' as any)}
          />
        </View>

        <View style={styles.gridContainer}>
          <DashboardCard 
            icon={Settings}
            label="Settings"
            onPress={() => router.push('/(truck)/settings' as any)}
          />
          {!isArchived && (
            <DashboardCard 
              icon={Archive}
              label="Archive Truck"
              onPress={handleArchiveTruck}
            />
          )}
          {isArchived && <View style={{ flex: 1, marginHorizontal: 6 }} />}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Profile</Text>
        </View>

        <TouchableOpacity 
          style={styles.previewCard}
          onPress={() => router.push(`/public/${truck.id}?preview=true` as any)}
          activeOpacity={0.7}
        >
          <View style={styles.previewIconContainer}>
            <Eye size={24} color={Colors.primary} />
          </View>
          <View style={styles.previewContent}>
            <Text style={styles.previewTitle}>Preview Your Profile</Text>
            <Text style={styles.previewSubtitle}>This is what customers see when they scan your QR code</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Share Your Truck</Text>
        </View>

        <View style={[styles.shareMainCard, !profileComplete && styles.shareMainCardDisabled]}>
          <View style={styles.shareMainHeader}>
            <View style={styles.shareMainIconContainer}>
              <Sparkles size={28} color={profileComplete ? Colors.primary : Colors.gray} />
            </View>
            <View style={styles.shareMainTextContainer}>
              <Text style={[styles.shareMainTitle, !profileComplete && styles.shareMainTitleDisabled]}>
                Share Your Truck
              </Text>
              <Text style={styles.shareMainSubtitle}>
                {profileComplete 
                  ? 'Let customers find your truck instantly'
                  : 'Complete your profile to enable sharing'}
              </Text>
            </View>
          </View>

          {profileComplete ? (
            <View style={styles.shareButtonsContainer}>
              <TouchableOpacity 
                style={styles.sharePrimaryButton}
                onPress={handleShareProfile}
                activeOpacity={0.7}
              >
                <Share2 size={20} color="#fff" />
                <Text style={styles.sharePrimaryButtonText}>Share via Text / Social</Text>
              </TouchableOpacity>

              <View style={styles.shareSecondaryButtons}>
  {SHOW_QR_TOOLS && (
    <TouchableOpacity 
      style={styles.shareSecondaryButton}
      onPress={handleShareQR}
      activeOpacity={0.7}
    >
      <QrCode size={20} color={Colors.primary} />
      <Text style={styles.shareSecondaryButtonText}>QR Code</Text>
    </TouchableOpacity>
  )}

  <TouchableOpacity 
    style={styles.shareSecondaryButton}
    onPress={handleCopyLink}
    activeOpacity={0.7}
  >
    <Link size={20} color={Colors.primary} />
    <Text style={styles.shareSecondaryButtonText}>Copy Link</Text>
  </TouchableOpacity>
</View>
              
            </View>
          ) : (
            <View style={styles.shareDisabledHelper}>
              <AlertCircle size={16} color={Colors.gray} />
              <Text style={styles.shareDisabledHelperText}>
                Add menu items, photos, and operating hours to unlock sharing
              </Text>
            </View>
          )}
        </View>

        {SHOW_QR_TOOLS && (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>Marketing Tools</Text>
  </View>
)}

       {SHOW_QR_TOOLS && (
        <View style={styles.gridContainer}>
          <DashboardCard 
            icon={QrCode}
            label="QR Code"
            onPress={() => router.push('/(truck)/qr' as any)}
          />
          <DashboardCard 
            icon={FileImage}
            label="Posters"
            onPress={() => router.push('/(truck)/poster-maker' as any)}
          />
        </View>
       )}

        {qrStats.totalScans > 0 && (
          <View style={styles.qrStatsCard}>
            <View style={styles.qrStatsHeader}>
              <ScanLine size={20} color={Colors.primary} />
              <Text style={styles.qrStatsTitle}>QR Engagement</Text>
            </View>
            <View style={styles.qrStatsRow}>
              <View style={styles.qrStatItem}>
                <Text style={styles.qrStatNumber}>{qrStats.totalScans}</Text>
                <Text style={styles.qrStatLabel}>Total Scans</Text>
              </View>
              {qrStats.lastScanned ? (
                <View style={styles.qrStatItem}>
                  <Text style={styles.qrStatNumber}>{formatLastScanned(qrStats.lastScanned)}</Text>
                  <Text style={styles.qrStatLabel}>Last Scanned</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>

      {toastVisible && (
        <View style={styles.toast}>
          <CheckCircle2 size={16} color="#fff" />
          <Text style={styles.toastText}>Link copied</Text>
        </View>
      )}

      {statusToast.visible && (
        <Toast 
          message={statusToast.message}
          type={statusToast.type}
          visible={statusToast.visible}
          onHide={() => setStatusToast({ ...statusToast, visible: false })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightGray,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: Colors.gray,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  toggleLeft: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  toggleSubtitle: {
    fontSize: 13,
    color: Colors.gray,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  gridContainer: {
    flexDirection: 'row',
    marginHorizontal: -6,
  },
  shareCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  shareTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  shareDescription: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 20,
    marginBottom: 16,
  },
  shareActions: {
    flexDirection: 'row',
    marginHorizontal: -6,
  },
  qrStatsContainer: {
    backgroundColor: `${Colors.primary}08`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  qrStatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  qrStatText: {
    flex: 1,
  },
  qrStatLabel: {
    fontSize: 13,
    color: Colors.gray,
    fontWeight: '500' as const,
  },
  qrStatValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginTop: 2,
  },
  lastScanInfo: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: `${Colors.primary}20`,
  },
  lastScanLabel: {
    fontSize: 12,
    color: Colors.gray,
    fontWeight: '500' as const,
  },
  lastScanValue: {
    fontSize: 14,
    color: Colors.dark,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  checklistCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  checklistTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  checklistDismiss: {
    padding: 4,
  },
  checklistSubtitle: {
    fontSize: 13,
    color: Colors.gray,
    marginBottom: 16,
    lineHeight: 18,
  },
  checklistItems: {
    gap: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  checklistIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistIconComplete: {
    opacity: 1,
  },
  checklistIconEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.gray,
  },
  checklistItemText: {
    fontSize: 15,
    color: Colors.dark,
    fontWeight: '500' as const,
  },
  checklistItemTextComplete: {
    textDecorationLine: 'line-through',
    color: Colors.gray,
  },
  cardWithBadge: {
    flex: 1,
    position: 'relative',
    marginHorizontal: 6,
  },
  warningBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.error,
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF8C00',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#FF8C00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  previewCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 2,
    borderColor: `${Colors.primary}20`,
  },
  previewIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContent: {
    flex: 1,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  previewSubtitle: {
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 18,
  },
  shareMainCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 2,
    borderColor: `${Colors.primary}30`,
  },
  shareMainCardDisabled: {
    borderColor: `${Colors.gray}20`,
    opacity: 0.7,
  },
  shareMainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  shareMainIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareMainTextContainer: {
    flex: 1,
  },
  shareMainTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  shareMainTitleDisabled: {
    color: Colors.gray,
  },
  shareMainSubtitle: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 20,
  },
  shareButtonsContainer: {
    gap: 12,
  },
  sharePrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sharePrimaryButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#fff',
  },
  shareSecondaryButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  shareSecondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: `${Colors.primary}10`,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: `${Colors.primary}30`,
  },
  shareSecondaryButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  shareDisabledHelper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: `${Colors.gray}10`,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${Colors.gray}20`,
  },
  shareDisabledHelperText: {
    flex: 1,
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  qrStatsCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  qrStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  qrStatsTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  qrStatsRow: {
    flexDirection: 'row',
    gap: 20,
  },
  qrStatItem: {
    flex: 1,
  },
  qrStatNumber: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginBottom: 4,
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dark,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#fff',
  },
  archiveBanner: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  archiveBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  archiveBannerText: {
    flex: 1,
  },
  archiveBannerTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 2,
  },
  archiveBannerSubtitle: {
    fontSize: 13,
    color: Colors.gray,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  restoreButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#fff',
  },
});
