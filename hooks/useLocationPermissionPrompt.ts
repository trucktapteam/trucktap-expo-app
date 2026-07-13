import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform } from 'react-native';
import * as Location from 'expo-location';
import { useApp } from '@/contexts/AppContext';

export type ResolvedCoordinates = { latitude: number; longitude: number };

export type RequestLocationResult = {
  status: Location.PermissionStatus | 'unavailable';
  coords: ResolvedCoordinates | null;
};

const PROMPT_SHOW_DELAY_MS = 600;
const PROMPT_HIDE_DURATION_MS = 200;

/**
 * The single source of truth for TruckTap's one-time, friendly location
 * permission experience, shared by every customer-facing map surface
 * (Discover, Full Map). Never calls requestForegroundPermissionsAsync on
 * mount — that only happens when the customer explicitly taps Allow Location
 * (via the inline card) or a manual action like Find Me.
 *
 * `hasSeenLocationPrompt` / `markLocationPromptSeen` live in AppContext (not
 * here) so the "already handled it" state is genuinely shared across every
 * screen that uses this hook, not just within one screen's lifetime.
 */
export function useLocationPermissionPrompt() {
  const { isOnboarded, hasSeenLocationPrompt, markLocationPromptSeen } = useApp();
  const [userLocation, setUserLocation] = useState<ResolvedCoordinates | null>(null);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const promptAnim = useRef(new Animated.Value(0)).current;
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveLocation = useCallback(async (requestPermission: boolean): Promise<RequestLocationResult> => {
    if (Platform.OS === 'web') {
      return { status: 'unavailable', coords: null };
    }

    try {
      const permission = requestPermission
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        return { status: permission.status, coords: null };
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords: ResolvedCoordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setUserLocation(coords);
      return { status: permission.status, coords };
    } catch (error) {
      console.error('[useLocationPermissionPrompt] Error resolving location:', error);
      return { status: 'unavailable', coords: null };
    }
  }, []);

  /** Silent, non-prompting refresh — safe to call on mount or app-foreground. */
  const refreshLocationIfGranted = useCallback(() => resolveLocation(false), [resolveLocation]);

  /** Triggers the native OS dialog. Only call this from an explicit user action. */
  const requestLocationNow = useCallback(() => resolveLocation(true), [resolveLocation]);

  const showPromptCard = useCallback(() => {
    showTimerRef.current = setTimeout(() => {
      setShowPrompt(true);
      Animated.spring(promptAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 11,
      }).start();
    }, PROMPT_SHOW_DELAY_MS);
  }, [promptAnim]);

  const dismissPromptCard = useCallback(() => {
    markLocationPromptSeen();
    Animated.timing(promptAnim, {
      toValue: 0,
      duration: PROMPT_HIDE_DURATION_MS,
      useNativeDriver: true,
    }).start(() => {
      setShowPrompt(false);
    });
  }, [markLocationPromptSeen, promptAnim]);

  const handleAllow = useCallback(() => {
    dismissPromptCard();
    void requestLocationNow();
  }, [dismissPromptCard, requestLocationNow]);

  const handleDismiss = useCallback(() => {
    dismissPromptCard();
  }, [dismissPromptCard]);

  // Silently check status on mount. Granted -> just refresh, no card.
  // Denied -> respect it, no card, no nagging. Undetermined and not already
  // handled elsewhere -> show the inline card instead of prompting directly.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let isActive = true;

    const evaluate = async () => {
      const permission = await Location.getForegroundPermissionsAsync().catch((error) => {
        console.error('[useLocationPermissionPrompt] Error checking permission:', error);
        return null;
      });
      if (!isActive || !permission) return;

      if (permission.status === 'granted') {
        void refreshLocationIfGranted();
        return;
      }

      if (permission.status === 'denied') {
        return;
      }

      if (isOnboarded || hasSeenLocationPrompt) {
        return;
      }

      showPromptCard();
    };

    void evaluate();

    return () => {
      isActive = false;
    };
  }, [refreshLocationIfGranted, isOnboarded, hasSeenLocationPrompt, showPromptCard]);

  useEffect(() => {
    return () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
      }
    };
  }, []);

  return {
    userLocation,
    showPrompt,
    promptAnim,
    handleAllow,
    handleDismiss,
    refreshLocationIfGranted,
    requestLocationNow,
  };
}
