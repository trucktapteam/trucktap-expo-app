import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { MapPin, ArrowLeft } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';

const GPS_LOOKUP_TIMEOUT_MS = 15000;

const getCurrentPositionWithTimeout = (
  options: Parameters<typeof Location.getCurrentPositionAsync>[0],
  timeoutMs = GPS_LOOKUP_TIMEOUT_MS
) => new Promise<Awaited<ReturnType<typeof Location.getCurrentPositionAsync>>>((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error(`Location lookup timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  Location.getCurrentPositionAsync(options)
    .then(resolve, reject)
    .finally(() => clearTimeout(timeout));
});

export default function UpdateLocationScreen() {
  const router = useRouter();
  const { getUserTruck, updateTruckDetails } = useApp();
  const truck = getUserTruck();

  const [isLoading, setIsLoading] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [pendingLocation, setPendingLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
    source: 'gps' | 'manual';
  } | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
  } | null>(
    truck &&
    Number.isFinite(truck.location?.latitude) &&
    Number.isFinite(truck.location?.longitude)
      ? truck.location
      : null
  );

  const saveLiveLocation = async (location: { latitude: number; longitude: number; address: string }) => {
    if (!truck) return;

    if (__DEV__) {
      console.log('[UpdateLocation] Saving live location:', {
        truckId: truck.id,
        latitude: location.latitude,
        longitude: location.longitude,
        hasAddress: location.address.trim().length > 0,
      });
    }

    await updateTruckDetails(truck.id, {
      open_now: true,
      location,
    });

    setCurrentLocation(location);
    setPendingLocation(null);

    Alert.alert(
      "You're now live",
      'You are now live and visible to customers.',
      [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]
    );
  };

  const handleGetCurrentLocation = async () => {
    try {
      setIsLoading(true);
      setPendingLocation(null);

      const existingPermission = await Location.getForegroundPermissionsAsync();
      if (__DEV__) {
        console.log('[UpdateLocation] Existing location permission:', {
          status: existingPermission.status,
          granted: existingPermission.granted,
          canAskAgain: existingPermission.canAskAgain,
        });
      }

      const permission = existingPermission.granted
        ? existingPermission
        : await Location.requestForegroundPermissionsAsync();

      if (__DEV__) {
        console.log('[UpdateLocation] Location permission result:', {
          status: permission.status,
          granted: permission.granted,
          canAskAgain: permission.canAskAgain,
        });
      }
      
      if (permission.status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Location permission is required to update your truck location.',
          [{ text: 'OK' }]
        );
        setIsLoading(false);
        return;
      }

      let location: Awaited<ReturnType<typeof Location.getCurrentPositionAsync>>;
      try {
        location = await getCurrentPositionWithTimeout({
          accuracy: Location.Accuracy.High,
        });
      } catch (currentLocationError) {
        if (__DEV__) {
          console.log('[UpdateLocation] High accuracy GPS lookup failed, retrying balanced accuracy:', currentLocationError);
        }

        location = await getCurrentPositionWithTimeout({
          accuracy: Location.Accuracy.Balanced,
        });
      }

      const { latitude, longitude } = location.coords;
      if (__DEV__) {
        console.log('[UpdateLocation] GPS result:', {
          latitude,
          longitude,
          accuracy: location.coords.accuracy,
          timestamp: location.timestamp,
        });
      }

      let address = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      
      try {
        const geocode = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });

        if (geocode && geocode.length > 0) {
          const result = geocode[0];
          const formatted = [
            result.streetNumber,
            result.street,
            result.city,
            result.region,
          ]
            .filter(Boolean)
            .join(', ');

          if (formatted) {
            address = formatted;
          }
        }
      } catch (error) {
        console.log('Geocoding error:', error);
      }

      const nextLocation = {
        latitude,
        longitude,
        address,
        source: 'gps',
      } as const;

      if (__DEV__) {
        console.log('[UpdateLocation] Selected live location:', nextLocation);
      }

      setPendingLocation(nextLocation);
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert(
        'Error',
        'Failed to get your current location. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualLocation = async () => {
    const trimmedAddress = manualAddress.trim();

    if (!trimmedAddress) {
      Alert.alert('Enter a location', 'Type the serving location you want customers to see.');
      return;
    }

    try {
      setIsLoading(true);
      setPendingLocation(null);

      const geocode = await Location.geocodeAsync(trimmedAddress);

      if (!geocode.length) {
        Alert.alert('Location not found', 'Try a more specific address or landmark.');
        return;
      }

      const { latitude, longitude } = geocode[0];
      let resolvedAddress = trimmedAddress;

      try {
        const reverseGeocode = await Location.reverseGeocodeAsync({
          latitude,
          longitude,
        });

        if (reverseGeocode && reverseGeocode.length > 0) {
          const result = reverseGeocode[0];
          const formatted = [
            result.name,
            result.street,
            result.city,
            result.region,
          ]
            .filter(Boolean)
            .join(', ');

          if (formatted) {
            resolvedAddress = formatted;
          }
        }
      } catch (error) {
        console.log('Reverse geocoding manual location failed:', error);
      }

      setPendingLocation({
        latitude,
        longitude,
        address: resolvedAddress,
        source: 'manual',
      });
    } catch (error) {
      console.error('Error geocoding location:', error);
      Alert.alert(
        'Error',
        'Failed to set that location. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPendingLocation = async () => {
    if (!pendingLocation) return;
    setIsLoading(true);

    try {
      const liveLocation = {
        latitude: pendingLocation.latitude,
        longitude: pendingLocation.longitude,
        address: pendingLocation.address,
      };

      const validation = {
        hasTruckId: Boolean(truck?.id),
        hasLatitude: Number.isFinite(liveLocation.latitude),
        hasLongitude: Number.isFinite(liveLocation.longitude),
        hasAddress: liveLocation.address.trim().length > 0,
        openNow: true,
      };

      if (__DEV__) {
        console.log('[UpdateLocation] Go Live validation:', {
          source: pendingLocation.source,
          truckId: truck?.id ?? null,
          ...validation,
        });
      }

      if (!validation.hasTruckId || !validation.hasLatitude || !validation.hasLongitude || !validation.hasAddress) {
        Alert.alert('Location incomplete', 'Please choose a valid live location and try again.');
        return;
      }

      await saveLiveLocation(liveLocation);
    } catch (error) {
      console.error('Error confirming live location:', error);
      Alert.alert(
        'Error',
        'Failed to save your live location. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color={Colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Go Live</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconContainer}>
            <MapPin size={64} color={Colors.primary} />
          </View>

          <Text style={styles.title}>Set Your Live Location</Text>
          <Text style={styles.description}>
            Choose how you want to set your serving location. Your truck only appears on the map after you confirm a location.
          </Text>

          {currentLocation && (
            <View style={styles.locationCard}>
              <Text style={styles.locationLabel}>Selected Location</Text>
              <Text style={styles.locationAddress}>{currentLocation.address}</Text>
              <Text style={styles.locationCoords}>
                {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
              </Text>
            </View>
          )}

          {pendingLocation && (
            <View style={styles.previewCard}>
              <Text style={styles.locationLabel}>
                {pendingLocation.source === 'gps' ? 'Current Location Preview' : 'Search Result'}
              </Text>
              <Text style={styles.locationAddress}>{pendingLocation.address}</Text>
              <Text style={styles.locationCoords}>
                {pendingLocation.latitude.toFixed(6)}, {pendingLocation.longitude.toFixed(6)}
              </Text>
              <TouchableOpacity
                style={[styles.confirmButton, isLoading && styles.buttonDisabled]}
                onPress={handleConfirmPendingLocation}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>Confirm Live Location</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleGetCurrentLocation}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MapPin size={20} color="#fff" />
                <Text style={styles.buttonText}>Use Current Location</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.manualCard}>
            <Text style={styles.manualTitle}>Search for a Location</Text>
            <Text style={styles.manualDescription}>
              Search for an address, landmark, or business and then confirm it as your serving location.
            </Text>
            <TextInput
              style={styles.input}
              value={manualAddress}
              onChangeText={setManualAddress}
              placeholder="123 Main St, Louisville, KY"
              placeholderTextColor={Colors.gray}
              autoCapitalize="words"
            />
            <TouchableOpacity
              style={[styles.secondaryButton, isLoading && styles.buttonDisabled]}
              onPress={handleManualLocation}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>Search This Location</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.note}>
            {'GPS is only used if you tap "Use Current Location." You can search and confirm a different serving spot anytime.'}
          </Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.dark,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 100,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: Colors.gray,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  locationCard: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.gray,
    textTransform: 'uppercase' as const,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  locationAddress: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 8,
    lineHeight: 22,
  },
  locationCoords: {
    fontSize: 14,
    color: Colors.gray,
    fontFamily: 'monospace',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
  manualCard: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  previewCard: {
    width: '100%',
    backgroundColor: `${Colors.primary}08`,
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: `${Colors.primary}25`,
  },
  manualTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  manualDescription: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 20,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.dark,
    marginBottom: 12,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  confirmButton: {
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#fff',
  },
  note: {
    fontSize: 13,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 20,
  },
});
