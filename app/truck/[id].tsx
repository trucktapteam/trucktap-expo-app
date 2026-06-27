import React from 'react';
import { ImageBackground, Linking, Platform, ScrollView, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { useTheme } from '@/contexts/ThemeContext';
import TruckProfile from '@/components/TruckProfile';
import Colors from '@/constants/colors';
import { canViewIncompleteTruckProfile, isTruckProfileComplete } from '@/lib/truckProfileCompleteness';

const IOS_APP_STORE_URL =
  process.env.EXPO_PUBLIC_IOS_APP_STORE_URL?.trim() || 'https://apps.apple.com/us/search?term=TruckTap';
const ANDROID_PLAY_STORE_URL =
  process.env.EXPO_PUBLIC_ANDROID_PLAY_STORE_URL?.trim() ||
  'https://play.google.com/store/apps/details?id=app.rork.trucktap_food_truck_finder_cqgko70';
const DEFAULT_WEB_HERO_IMAGE = 'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=1200';

export default function TruckDetailScreen() {
  const { id, preview } = useLocalSearchParams();
  const router = useRouter();
  const { currentUser, incrementQrScan, foodTrucks, allTrucksLoading } = useApp();
  const { colors } = useTheme();
  const isPreview = preview === 'true';
  const hasTrackedScan = React.useRef(false);
  const truckId = typeof id === 'string' ? id : '';
  const truck = foodTrucks.find((item) => item.id === truckId);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!id || typeof id !== 'string') return;

    if (!foodTrucks || foodTrucks.length === 0) {
      return;
    }

    const truckExists = foodTrucks.find((truck) => truck.id === id);
    const isArchivedOrTestHiddenFromCustomers =
      truckExists?.is_test === true ||
      truckExists?.archived === true ||
      !!truckExists?.archivedAt;
    if ((!truckExists || isArchivedOrTestHiddenFromCustomers) && !isPreview) {
      router.replace('/(customer)/(tabs)/discover' as any);
      return;
    }

    if (!isPreview && truckExists && !canViewIncompleteTruckProfile(truckExists, currentUser)) {
      return;
    }

    if (!isPreview && truckExists && !hasTrackedScan.current) {
      hasTrackedScan.current = true;

      const platform =
        Platform.OS === 'ios'
          ? 'iOS'
          : Platform.OS === 'android'
          ? 'Android'
          : 'Web';

      incrementQrScan(id, platform);
    }
  }, [currentUser, foodTrucks, id, incrementQrScan, isPreview, router]);

  if (Platform.OS === 'web') {
    const incompleteHiddenFromCustomer =
      !!truck &&
      !isPreview &&
      !isTruckProfileComplete(truck) &&
      !canViewIncompleteTruckProfile(truck, currentUser);
    const showTruckDetails =
      !!truck &&
      truck.is_test !== true &&
      truck.archived !== true &&
      !truck.archivedAt &&
      (isPreview || !incompleteHiddenFromCustomer);

    const title = allTrucksLoading
      ? 'Opening TruckTap'
      : incompleteHiddenFromCustomer
      ? 'This truck profile is still being completed.'
      : showTruckDetails
      ? truck.name
      : 'Find this food truck on TruckTap';
    const subtitle = showTruckDetails
      ? [truck.cuisine_type, truck.location.address].filter(Boolean).join(' • ')
      : incompleteHiddenFromCustomer
      ? 'Please check back soon.'
      : 'Install TruckTap to see live food truck details, menus, photos, and updates.';
    const heroImage = showTruckDetails ? truck.hero_image || truck.logo || DEFAULT_WEB_HERO_IMAGE : DEFAULT_WEB_HERO_IMAGE;

    return (
      <ScrollView style={styles.webPage} contentContainerStyle={styles.webContent}>
        <View style={styles.webShell}>
          <ImageBackground
            source={{ uri: heroImage }}
            style={styles.webHero}
            imageStyle={styles.webHeroImage}
          >
            <View style={styles.webHeroOverlay}>
              <Text style={styles.webBrand}>TruckTap</Text>
              <Text style={styles.webTitle}>{title}</Text>
              <Text style={styles.webSubtitle}>{subtitle}</Text>
            </View>
          </ImageBackground>

          {showTruckDetails && (
            <View style={styles.webDetails}>
              {truck.bio ? <Text style={styles.webBio}>{truck.bio}</Text> : null}
              <View style={styles.webMetaRow}>
                <Text style={styles.webMetaLabel}>Status</Text>
                <Text style={[styles.webMetaValue, truck.open_now ? styles.webOpen : styles.webClosed]}>
                  {truck.open_now ? 'Open now' : 'Check the app for current hours'}
                </Text>
              </View>
              {truck.phone ? (
                <View style={styles.webMetaRow}>
                  <Text style={styles.webMetaLabel}>Phone</Text>
                  <Text style={styles.webMetaValue}>{truck.phone}</Text>
                </View>
              ) : null}
              {truck.website ? (
                <TouchableOpacity onPress={() => Linking.openURL(truck.website || '')}>
                  <Text style={styles.webLink}>{truck.website}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          <View style={styles.webDownloadBand}>
            <Text style={styles.webDownloadTitle}>Get TruckTap</Text>
            <Text style={styles.webDownloadText}>
              Open this truck in the app for live location, menus, photos, and favorites.
            </Text>
            <View style={styles.webButtonRow}>
              <TouchableOpacity style={styles.webStoreButton} onPress={() => Linking.openURL(IOS_APP_STORE_URL)}>
                <Text style={styles.webStoreButtonEyebrow}>Download on the</Text>
                <Text style={styles.webStoreButtonText}>App Store</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.webStoreButton} onPress={() => Linking.openURL(ANDROID_PLAY_STORE_URL)}>
                <Text style={styles.webStoreButtonEyebrow}>Get it on</Text>
                <Text style={styles.webStoreButtonText}>Google Play</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      {isPreview && (
        <View style={[styles.previewBanner, { backgroundColor: colors.primary }]}>
          <Text style={[styles.previewBannerText, { color: colors.background }]}>Customer View</Text>
        </View>
      )}
      <TruckProfile truckId={id as string} mode="customer" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webPage: {
    flex: 1,
    backgroundColor: '#F7F7F4',
  },
  webContent: {
    minHeight: '100%',
    alignItems: 'center',
    padding: 20,
  },
  webShell: {
    width: '100%',
    maxWidth: 760,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E2DC',
  },
  webHero: {
    minHeight: 340,
    backgroundColor: Colors.dark,
  },
  webHeroImage: {
    opacity: 0.78,
  },
  webHeroOverlay: {
    flex: 1,
    minHeight: 340,
    justifyContent: 'flex-end',
    padding: 28,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  webBrand: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800' as const,
    marginBottom: 12,
  },
  webTitle: {
    color: '#FFFFFF',
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800' as const,
    marginBottom: 10,
  },
  webSubtitle: {
    color: '#F8F4EE',
    fontSize: 17,
    lineHeight: 25,
    maxWidth: 620,
  },
  webDetails: {
    padding: 28,
    gap: 14,
  },
  webBio: {
    color: Colors.dark,
    fontSize: 16,
    lineHeight: 24,
  },
  webMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 14,
  },
  webMetaLabel: {
    color: Colors.gray,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  webMetaValue: {
    color: Colors.dark,
    fontSize: 14,
    textAlign: 'right',
    flex: 1,
  },
  webOpen: {
    color: Colors.success,
    fontWeight: '800' as const,
  },
  webClosed: {
    color: Colors.gray,
  },
  webLink: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  webDownloadBand: {
    padding: 28,
    backgroundColor: '#111111',
    gap: 12,
  },
  webDownloadTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800' as const,
  },
  webDownloadText: {
    color: '#EDEDED',
    fontSize: 15,
    lineHeight: 22,
  },
  webButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  webStoreButton: {
    minWidth: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  webStoreButtonEyebrow: {
    color: Colors.gray,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  webStoreButtonText: {
    color: Colors.dark,
    fontSize: 19,
    fontWeight: '800' as const,
  },
  previewBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  previewBannerText: {
    fontSize: 13,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
});
