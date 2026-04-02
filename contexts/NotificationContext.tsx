import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { DEBUG } from '@/constants/debug';
import * as Device from 'expo-device';
import { supabase } from '@/lib/supabase';

const isExpoGo =
  Constants.executionEnvironment === 'storeClient' ||
  Constants.appOwnership === 'expo';

  console.log('[Notifications] executionEnvironment:', Constants.executionEnvironment);
console.log('[Notifications] appOwnership:', Constants.appOwnership);
console.log('[Notifications] isExpoGo:', isExpoGo);

type NotificationPreferences = {
  favoritesOpen: boolean;
  newTrucksNearby: boolean;
  truckAnnouncements: boolean;
};

const DEFAULT_PREFS: NotificationPreferences = {
  favoritesOpen: false,
  newTrucksNearby: false,
  truckAnnouncements: false,
};

const STORAGE_KEY = 'notificationPreferences';

if (!isExpoGo && Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    console.log('[Notifications] Error setting notification handler:', e);
  }
}

export const [NotificationProvider, useNotifications] = createContextHook(() => {
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unknown'>('unknown');
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const init = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setPreferences(JSON.parse(stored));
          if (DEBUG) console.log('[Notifications] Loaded preferences from storage');
        }
      } catch (error) {
        console.log('[Notifications] Error loading preferences:', error);
      }

      if (Platform.OS === 'web') {
        if ('Notification' in window) {
          const perm = Notification.permission;
          setPermissionStatus(
            perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'undetermined'
          );
        } else {
          setPermissionStatus('denied');
        }
      } else if (isExpoGo) {
  if (DEBUG) console.log('[Notifications] Running in Expo Go, skipping push init');
  setPermissionStatus('undetermined');
  setIsLoading(false);
  return;
} else {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    console.log('[Notifications] RAW permission status:', status);
    setPermissionStatus(
      status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined'
    );
    if (DEBUG) console.log('[Notifications] Permission status:', status);

    if (Device.isDevice && status === 'granted') {
      const tokenResponse = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });

      console.log('[Notifications] Expo Push Token:', tokenResponse.data);
    } else {
      console.log('[Notifications] Skipping push token fetch - not physical device or permission not granted');
    }
  } catch (error) {
    console.log('[Notifications] Error checking permission or getting push token:', error);
    setPermissionStatus('unknown');
  }
}

      setIsLoading(false);
    };
    void init();
  }, []);

  const checkPermission = useCallback(async () => {
    if (Platform.OS === 'web') {
      if ('Notification' in window) {
        const perm = Notification.permission;
        setPermissionStatus(
          perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'undetermined'
        );
      } else {
        setPermissionStatus('denied');
      }
      return;
    }

    if (isExpoGo) {
      if (DEBUG) console.log('[Notifications] Running in Expo Go, skipping permission check');
      return;
    }

    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionStatus(
        status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined'
      );
      if (DEBUG) console.log('[Notifications] Permission status:', status);
    } catch (error) {
      console.log('[Notifications] Error checking permission:', error);
      setPermissionStatus('unknown');
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      if ('Notification' in window) {
        const result = await Notification.requestPermission();
        const granted = result === 'granted';
        setPermissionStatus(granted ? 'granted' : 'denied');
        return granted;
      }
      return false;
    }

    if (isExpoGo) {
      if (DEBUG) console.log('[Notifications] Running in Expo Go, skipping permission request');
      return false;
    }

    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing === 'granted') {
        setPermissionStatus('granted');
        return true;
      }

      const { status } = await Notifications.requestPermissionsAsync();
      setPermissionStatus(status === 'granted' ? 'granted' : 'denied');

      if (status === 'denied') {
        Alert.alert(
          'Notifications Disabled',
          'To receive notifications, please enable them in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => {
              if (Platform.OS !== 'web') {
                void import('react-native').then(({ Linking }) => Linking.openSettings());
              }
            }},
          ]
        );
      }

      if (DEBUG) console.log('[Notifications] Permission request result:', status);
      return status === 'granted';
    } catch (error) {
      console.log('[Notifications] Error requesting permission:', error);
      return false;
    }
  }, []);

  const savePreferences = useCallback(async (newPrefs: NotificationPreferences) => {
  console.log('[Notifications] savePreferences called with:', newPrefs);

  setPreferences(newPrefs);

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newPrefs));
    console.log('[Notifications] Saved locally');
  } catch (error) {
    console.log('[Notifications] Local save failed:', error);
  }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    console.log('[Notifications] getUser result:', userData, userError);

    if (userError) {
      console.log('[Notifications] Error getting user:', userError);
      return;
    }

    if (!userData?.user) {
      console.log('[Notifications] No logged-in user found');
      return;
    }

   const { data: updatedRows, error: updateError } = await supabase
  .from('profiles')
  .update({
    notify_favorites_open: newPrefs.favoritesOpen,
    notify_new_trucks: newPrefs.newTrucksNearby,
    notify_announcements: newPrefs.truckAnnouncements,
  })
  .eq('id', userData.user.id)
  .select();

    console.log('[Notifications] profile update result:', updatedRows, updateError);

    if (updateError) {
      console.log('[Notifications] Error saving to Supabase:', updateError);
    } else {
      console.log('[Notifications] Saved to Supabase');
    }
  } catch (error) {
    console.log('[Notifications] Supabase save failed:', error);
  }
}, []);

  const togglePreference = useCallback(async (key: keyof NotificationPreferences, value: boolean) => {
  

  if (value && !isExpoGo) {
    let granted = permissionStatus === 'granted';

    if (!granted) {
      granted = await requestPermission();
      if (!granted) return;
    }
  }

  const newPrefs = {
    ...preferences,
    [key]: value,
  };

  await savePreferences(newPrefs);
}, [preferences, permissionStatus, requestPermission, savePreferences]);
    
  return useMemo(() => ({
    permissionStatus,
    preferences,
    isLoading,
    requestPermission,
    checkPermission,
    togglePreference,
  }), [permissionStatus, preferences, isLoading, requestPermission, checkPermission, togglePreference]);
});
