import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, CalendarDays, ChevronDown, Clock, MapPin, Pencil, RefreshCw, Trash2, X, Zap } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { SavedLocation, UpcomingStop, UpcomingStopStatus } from '@/types';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';
import {
  configureUpcomingStopAutomation,
  HandsFreeLiveOwnerSettings,
  loadHandsFreeLiveOwnerState,
  loadUpcomingStopLocationStatuses,
  setHandsFreeLiveConfirmationNotifications,
  setUpcomingStopLocation,
  UpcomingStopAutomationStatus,
  UpcomingStopLocationStatus,
} from '@/lib/handsFreeLive';
import { getDestinationLocation } from '@/lib/locationTimezone';
import { getUpcomingStopReminderIds } from '@/lib/upcomingStopReminders';
import {
  formatStopDuration,
  getStopDurationMinutes,
} from '@/lib/upcomingStopTime';

const STATUSES: UpcomingStopStatus[] = ['scheduled', 'delayed', 'cancelled', 'sold_out', 'completed'];
const REMINDER_SETTINGS_KEY = 'upcomingStopReminderSettings';
const REMINDER_IDS_KEY = 'upcomingStopReminderIds';
const RECENT_LOCATIONS_KEY = 'upcomingStopRecentLocations';
const RECENT_LOCATIONS_LIMIT = 5;
const DEFAULT_REMINDER_MINUTES = 30;
const REMINDER_MINUTE_OPTIONS = [15, 30, 60] as const;
const GO_LIVE_WINDOW_MINUTES = 30;
const GO_LIVE_WINDOW_MS = GO_LIVE_WINDOW_MINUTES * 60 * 1000;
const REMINDER_NOTIFICATION_CHANNEL_ID = 'upcoming-stop-reminders';
const REMINDER_CANCEL_STATUSES: UpcomingStopStatus[] = ['cancelled', 'completed', 'sold_out'];

const statusLabels: Record<UpcomingStopStatus, string> = {
  scheduled: 'Scheduled',
  delayed: 'Delayed',
  cancelled: 'Cancelled',
  sold_out: 'Sold out',
  completed: 'Completed',
};

const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Time not set';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const atTime = (hour: number, minute: number) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
};

// 11am-2pm is the default window for a new stop, but if it's already past
// 11am the moment the form resets, that window lands in the past for a
// same-day date - which silently trips scheduleReminderForStop's "too soon"
// guard (no reminder scheduled) for anyone who picks today without touching
// the time fields. Roll the default forward from the current hour instead.
const getDefaultStopTimes = () => {
  const now = new Date();
  const startHour =
    now.getHours() >= 20
      ? 11
      : now.getHours() >= 11
        ? now.getHours() + 1
        : 11;
  const endHour = startHour + 3;
  return {
    start: atTime(startHour, 0),
    end: atTime(endHour, 0),
  };
};

const combineDateAndTime = (dateValue: Date, timeValue: Date) =>
  new Date(
    dateValue.getFullYear(),
    dateValue.getMonth(),
    dateValue.getDate(),
    timeValue.getHours(),
    timeValue.getMinutes(),
    0,
    0
  );

const formatDateButton = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const formatSelectedDate = (date: Date) =>
  date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

const formatTimeButton = (date: Date) =>
  date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

const getUpcomingStopReminderTime = (stop: UpcomingStop, minutesBefore: number) => {
  const startsAtTime = Date.parse(stop.starts_at);
  if (!Number.isFinite(startsAtTime)) return null;

  return new Date(startsAtTime - minutesBefore * 60 * 1000);
};

const getReminderNotificationTrigger = (fireAt: Date, now = new Date()) => {
  if (Platform.OS === 'android') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL as const,
      seconds: Math.max(1, Math.floor((fireAt.getTime() - now.getTime()) / 1000)),
      channelId: REMINDER_NOTIFICATION_CHANNEL_ID,
    };
  }

  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE as const,
    date: fireAt,
  };
};

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const startOfSelectedDate = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

type PickerTarget = 'date' | 'start' | 'end' | null;
type TimePeriod = 'AM' | 'PM';

type ReminderSettings = {
  enabled: boolean;
  minutesBefore: number;
};

type ReminderIds = Record<string, string>;
type ReminderScheduleResult = {
  ids: ReminderIds;
};

type RecentLocationEntry = {
  text: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  usedAt: string;
};

// 'confirmed' - geocoded, reverse-geocoded, and the owner confirmed the
// match (or it came from a trusted cached source, skipping the dialog).
// 'declined' - the owner explicitly backed out (either "NO, EDIT ADDRESS"
// on a real match, or "EDIT LOCATION" when nothing geocoded at all) -
// callers must create nothing and leave the form untouched.
// 'unverified' - geocoding found no match and the owner chose to schedule
// anyway; callers proceed with location_text only, null coordinates, and
// Hands-Free LIVE unavailable for that stop.
type StopLocationResolution =
  | { status: 'confirmed'; latitude: number; longitude: number; timezone: string }
  | { status: 'declined' }
  | { status: 'unverified' };

const normalizeReminderSettings = (settings?: Partial<ReminderSettings> | null): ReminderSettings => ({
  enabled: settings?.enabled !== false,
  minutesBefore: REMINDER_MINUTE_OPTIONS.includes(
    settings?.minutesBefore as (typeof REMINDER_MINUTE_OPTIONS)[number]
  )
    ? settings!.minutesBefore!
    : DEFAULT_REMINDER_MINUTES,
});

const DEFAULT_AUTOMATION_SETTINGS: HandsFreeLiveOwnerSettings = {
  supported: false,
  systemEnabled: false,
  startGraceMinutes: 15,
  endGraceMinutes: 5,
  confirmationNotificationsEnabled: true,
};

const getStatusColor = (status: UpcomingStopStatus) => {
  switch (status) {
    case 'delayed':
      return Colors.warning;
    case 'cancelled':
      return Colors.danger;
    case 'sold_out':
      return '#7C3AED';
    case 'completed':
      return Colors.gray;
    default:
      return Colors.success;
  }
};

const canStopGoLive = (stop: UpcomingStop, nowMs: number) => {
  if (REMINDER_CANCEL_STATUSES.includes(stop.status)) return false;

  const startsAtMs = Date.parse(stop.starts_at);
  const endsAtMs = Date.parse(stop.ends_at);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) return false;
  if (endsAtMs <= nowMs) return false;

  const activeNow = startsAtMs <= nowMs && nowMs < endsAtMs;
  const startsWithinWindow = startsAtMs > nowMs && startsAtMs - nowMs <= GO_LIVE_WINDOW_MS;

  return activeNow || startsWithinWindow;
};

const getTimePeriod = (date: Date): TimePeriod =>
  date.getHours() >= 12 ? 'PM' : 'AM';

const withTimePeriod = (date: Date, period: TimePeriod) => {
  const nextDate = new Date(date);
  const hours = nextDate.getHours();

  if (period === 'AM' && hours >= 12) {
    nextDate.setHours(hours - 12);
  } else if (period === 'PM' && hours < 12) {
    nextDate.setHours(hours + 12);
  }

  return nextDate;
};

const US_STATE_ABBREVIATIONS: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
  Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH',
  Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
  'District of Columbia': 'DC',
};

const abbreviateRegion = (region: string | null | undefined): string | null => {
  if (!region) return null;
  const trimmed = region.trim();
  if (!trimmed) return null;
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return US_STATE_ABBREVIATIONS[trimmed] ?? trimmed;
};

const formatGeocodedAddress = (address: Location.LocationGeocodedAddress | undefined) => {
  if (!address) return null;

  // address.name is omitted: it's unreliable (often just repeats the street
  // number) and produces messy, duplicated first lines - street + city/
  // state/zip is what an owner needs to judge whether the match is right.
  const street = [address.streetNumber, address.street]
    .filter(Boolean)
    .join(' ');
  const cityStateZip = [
    address.city,
    [abbreviateRegion(address.region), address.postalCode].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  const lines = [street, cityStateZip].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
};

const confirmAutomationLocation = (
  locationLabel: string,
  resolvedAddress: string | null,
  title: string = 'Confirm automatic LIVE location'
) =>
  new Promise<boolean>(resolve => {
    Alert.alert(
      title,
      resolvedAddress
        ? `You entered\n${locationLabel}\n\n📍 TruckTap found\n${resolvedAddress}\n\nIs this the correct location?`
        : `You entered\n${locationLabel}\n\nTruckTap could not find a detailed address for this location, only approximate coordinates.\n\nIs this the correct location?`,
      [
        { text: 'NO, EDIT ADDRESS', style: 'cancel', onPress: () => resolve(false) },
        { text: 'YES, USE THIS LOCATION', onPress: () => resolve(true) },
      ],
      { cancelable: false }
    );
  });

// Shown when geocodeAsync finds no match at all, so there's nothing to
// confirm - the owner can go fix the text, or accept a stop with an
// unverified location (no coordinates, no Hands-Free LIVE) rather than
// being blocked outright.
const confirmUnverifiableLocation = (locationLabel: string) =>
  new Promise<'edit' | 'unverified'>(resolve => {
    Alert.alert(
      'Could not verify location',
      `TruckTap could not verify "${locationLabel}". You can edit the address, or schedule this stop without a verified location - Hands-Free LIVE won't be available for it.`,
      [
        { text: 'EDIT LOCATION', style: 'cancel', onPress: () => resolve('edit') },
        { text: 'SCHEDULE WITHOUT VERIFIED LOCATION', onPress: () => resolve('unverified') },
      ],
      { cancelable: false }
    );
  });

export default function UpcomingStopsScreen() {
  const router = useRouter();
  const {
    getUserTruck,
    getUpcomingStops,
    addUpcomingStop,
    updateUpcomingStop,
    deleteUpcomingStop,
    refreshUpcomingStops,
    getSavedLocations,
    addSavedLocation,
    updateSavedLocation,
    deleteSavedLocation,
    updateTruckDetails,
  } = useApp();
  const truck = getUserTruck();
  useTruckLifecycleLogger('UpcomingStopsScreen');

  const [dateValue, setDateValue] = useState(() => new Date());
  // Deliberately empty on load - a new stop must not default to today's date.
  // dateValue above still needs a valid Date for the native picker widget's
  // own initial display, but selectedDates (the actually-confirmed dates for
  // this stop) starts blank so the owner must explicitly pick at least one.
  const [selectedDates, setSelectedDates] = useState<Date[]>(() => []);
  const [startTime, setStartTime] = useState(() => getDefaultStopTimes().start);
  const [endTime, setEndTime] = useState(() => getDefaultStopTimes().end);
  const [endsNextDay, setEndsNextDay] = useState(false);
  const [locationText, setLocationText] = useState('');
  const [selectedLocationSource, setSelectedLocationSource] = useState<{
    text: string;
    latitude: number;
    longitude: number;
    timezone: string;
  } | null>(null);
  const [note, setNote] = useState('');
  // Only used when creating a new stop (not editing) - pre-seeded from the
  // truck's Hands-Free LIVE default, fully editable per stop before saving.
  const [handsFreeLiveOnForNewStop, setHandsFreeLiveOnForNewStop] = useState(
    () => truck?.hands_free_live_default_enabled === true
  );
  const [truckDefaultSaving, setTruckDefaultSaving] = useState(false);
  const [savedLocationModalVisible, setSavedLocationModalVisible] = useState(false);
  const [editingSavedLocation, setEditingSavedLocation] = useState<SavedLocation | null>(null);
  const [savedLocationFormLabel, setSavedLocationFormLabel] = useState('');
  const [savedLocationFormText, setSavedLocationFormText] = useState('');
  const [savedLocationModalError, setSavedLocationModalError] = useState<string | null>(null);
  const [savedLocationSaving, setSavedLocationSaving] = useState(false);
  const [savedLocationDeleting, setSavedLocationDeleting] = useState(false);
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyStopId, setBusyStopId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [activePicker, setActivePicker] = useState<PickerTarget>(null);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(() =>
    normalizeReminderSettings()
  );
  const [reminderIds, setReminderIds] = useState<ReminderIds>({});
  const [scheduledReminderIds, setScheduledReminderIds] = useState<ReminderIds>({});
  const [reminderSettingsLoaded, setReminderSettingsLoaded] = useState(false);
  const [recentLocations, setRecentLocations] = useState<RecentLocationEntry[]>([]);
  const [recentLocationsLoaded, setRecentLocationsLoaded] = useState(false);
  const [automationSettings, setAutomationSettings] = useState<HandsFreeLiveOwnerSettings>(
    DEFAULT_AUTOMATION_SETTINGS
  );
  const [automationStatuses, setAutomationStatuses] = useState<
    Record<string, UpcomingStopAutomationStatus>
  >({});
  const [automationLoading, setAutomationLoading] = useState(false);
  const [locationStatuses, setLocationStatuses] = useState<
    Record<string, UpcomingStopLocationStatus>
  >({});
  const [confirmationPreferenceSaving, setConfirmationPreferenceSaving] = useState(false);
  const reminderSettingsRef = useRef(reminderSettings);
  const reminderIdsRef = useRef(reminderIds);
  const recentLocationsRef = useRef(recentLocations);
  const scrollViewRef = useRef<ScrollView>(null);
  const locationInputRef = useRef<TextInput>(null);

  const stops = useMemo(
    () => truck ? getUpcomingStops(truck.id) : [],
    [getUpcomingStops, truck]
  );

  const savedLocationsForTruck = useMemo(
    () => truck ? getSavedLocations(truck.id) : [],
    [getSavedLocations, truck]
  );

  // Recent Locations are persisted independently (AsyncStorage, see
  // RECENT_LOCATIONS_KEY below) rather than derived from live stops, so an
  // address stays in Recent even after the stop that used it is deleted.
  // recentLocations is already most-recent-first, deduped, and capped at
  // RECENT_LOCATIONS_LIMIT - this just filters out anything already Saved.
  const recentLocationTexts = useMemo(() => {
    const savedTexts = new Set(savedLocationsForTruck.map(location => location.location_text));
    return recentLocations
      .filter(entry => !savedTexts.has(entry.text))
      .map(entry => entry.text);
  }, [recentLocations, savedLocationsForTruck]);

  const refreshAutomationState = React.useCallback(async () => {
    if (!truck) {
      setAutomationSettings(DEFAULT_AUTOMATION_SETTINGS);
      setAutomationStatuses({});
      return;
    }

    setAutomationLoading(true);
    try {
      const state = await loadHandsFreeLiveOwnerState(truck.id);
      setAutomationSettings(state.settings);
      setAutomationStatuses(
        Object.fromEntries(state.statuses.map(status => [status.stopId, status]))
      );
    } catch (error) {
      console.log('[UpcomingStops] Failed to load Hands-Free LIVE state:', error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not load Hands-Free LIVE status.'
      );
    } finally {
      setAutomationLoading(false);
    }
  }, [truck]);

  const refreshLocationStatuses = React.useCallback(async () => {
    if (!truck) {
      setLocationStatuses({});
      return;
    }

    try {
      const statuses = await loadUpcomingStopLocationStatuses(truck.id);
      setLocationStatuses(
        Object.fromEntries(statuses.map(status => [status.stopId, status]))
      );
    } catch (error) {
      console.log('[UpcomingStops] Failed to load stop location status:', error);
    }
  }, [truck]);

  React.useEffect(() => {
    reminderSettingsRef.current = reminderSettings;
  }, [reminderSettings]);

  React.useEffect(() => {
    reminderIdsRef.current = reminderIds;
  }, [reminderIds]);

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      setNowMs(Date.now());
      void refreshAutomationState();
      void refreshLocationStatuses();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [refreshAutomationState, refreshLocationStatuses]);

  React.useEffect(() => {
    void refreshAutomationState();
  }, [refreshAutomationState]);

  React.useEffect(() => {
    void refreshLocationStatuses();
  }, [refreshLocationStatuses]);

  React.useEffect(() => {
    const loadReminderState = async () => {
      try {
        const [storedSettings, storedIds, scheduledNotifications] = await Promise.all([
          AsyncStorage.getItem(REMINDER_SETTINGS_KEY),
          AsyncStorage.getItem(REMINDER_IDS_KEY),
          Platform.OS === 'web'
            ? Promise.resolve(null)
            : Notifications.getAllScheduledNotificationsAsync().catch(error => {
                console.log('[UpcomingStops] Failed to inspect scheduled reminders:', error);
                return null;
              }),
        ]);

        if (storedSettings) {
          const parsed = JSON.parse(storedSettings);
          const nextSettings = normalizeReminderSettings(parsed);
          reminderSettingsRef.current = nextSettings;
          setReminderSettings(nextSettings);
        }

        let parsedIds: ReminderIds = {};
        if (storedIds) {
          const storedReminderIds = JSON.parse(storedIds);
          if (storedReminderIds && typeof storedReminderIds === 'object') {
            parsedIds = storedReminderIds;
          }
        }

        const actualIds = scheduledNotifications
          ? getUpcomingStopReminderIds(scheduledNotifications)
          : parsedIds;
        reminderIdsRef.current = actualIds;
        setReminderIds(actualIds);
        setScheduledReminderIds(actualIds);

        if (scheduledNotifications) {
          await AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(actualIds));
        }
      } catch (error) {
        console.log('[UpcomingStops] Failed to load reminder settings:', error);
      } finally {
        setReminderSettingsLoaded(true);
      }
    };

    void loadReminderState();
  }, []);

  React.useEffect(() => {
    const loadRecentLocations = async () => {
      try {
        const stored = await AsyncStorage.getItem(RECENT_LOCATIONS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const normalized: RecentLocationEntry[] = parsed
              .filter((entry): entry is RecentLocationEntry => typeof entry?.text === 'string' && entry.text.length > 0)
              .slice(0, RECENT_LOCATIONS_LIMIT);
            recentLocationsRef.current = normalized;
            setRecentLocations(normalized);
          }
        }
      } catch (error) {
        console.log('[UpcomingStops] Failed to load recent locations:', error);
      } finally {
        setRecentLocationsLoaded(true);
      }
    };

    void loadRecentLocations();
  }, []);

  const persistReminderSettings = async (settings: ReminderSettings) => {
    const normalizedSettings = normalizeReminderSettings(settings);
    reminderSettingsRef.current = normalizedSettings;
    await AsyncStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(normalizedSettings));
    setReminderSettings(normalizedSettings);
  };

  const persistReminderIds = async (ids: ReminderIds) => {
    reminderIdsRef.current = ids;
    setReminderIds(ids);
    await AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(ids));
  };

  // Merges by text: a call with just `text` (recorded right when a stop is
  // saved, geocoded or not) preserves any coordinates already known from a
  // prior call; a later call with `coords` (once geocoding resolves)
  // enriches the same entry in place. Order-independent, safe either way.
  const persistRecentLocation = async (
    text: string,
    coords?: { latitude: number; longitude: number; timezone: string }
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const current = recentLocationsRef.current;
    const existing = current.find(entry => entry.text === trimmed);
    const nextEntry: RecentLocationEntry = {
      text: trimmed,
      latitude: coords?.latitude ?? existing?.latitude,
      longitude: coords?.longitude ?? existing?.longitude,
      timezone: coords?.timezone ?? existing?.timezone,
      usedAt: new Date().toISOString(),
    };
    const next = [nextEntry, ...current.filter(entry => entry.text !== trimmed)].slice(
      0,
      RECENT_LOCATIONS_LIMIT
    );

    recentLocationsRef.current = next;
    setRecentLocations(next);
    try {
      await AsyncStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(next));
    } catch (error) {
      console.log('[UpcomingStops] Failed to persist recent locations:', error);
    }
  };

  // Recent entries are local-only convenience state, not a record of the
  // stops themselves - deleting one only ever touches recentLocations/
  // RECENT_LOCATIONS_KEY. Saved Locations, existing stops, and the
  // reminder/Hands-Free LIVE settings live in entirely separate state and
  // are never read or written here.
  const removeRecentLocations = async (predicate: (entry: RecentLocationEntry) => boolean) => {
    const current = recentLocationsRef.current;
    const removed = current.filter(predicate);
    if (removed.length === 0) return;

    const next = current.filter(entry => !predicate(entry));
    recentLocationsRef.current = next;
    setRecentLocations(next);

    // A chip's delete button only ever exists for a Recent that's currently
    // visible, and recentLocationTexts already excludes any text that
    // matches a Saved Location - so a text match here can only mean the
    // active selection came from the Recent being removed, never from
    // Saved. Clear just that selection marker; the typed location text
    // stays exactly as it was so the form isn't disturbed underneath the
    // owner.
    if (selectedLocationSource && removed.some(entry => entry.text === selectedLocationSource.text)) {
      setSelectedLocationSource(null);
    }

    try {
      await AsyncStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(next));
    } catch (error) {
      console.log('[UpcomingStops] Failed to persist recent locations:', error);
    }
  };

  const handleDeleteRecentLocation = (text: string) => {
    void removeRecentLocations(entry => entry.text === text);
  };

  const handleClearAllRecentLocations = () => {
    Alert.alert(
      'Clear all recent locations?',
      'This removes every Recent Location on this device. Saved Locations and existing scheduled stops are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: () => void removeRecentLocations(() => true),
        },
      ]
    );
  };

  const requestLocalNotificationPermission = async () => {
    if (Platform.OS === 'web') {
      setErrorMessage('Local stop reminders are not available on web.');
      return false;
    }

    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === 'granted') {
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync(
      Platform.OS === 'ios'
        ? {
            ios: {
              allowAlert: true,
              allowBadge: true,
              allowSound: true,
            },
          }
        : {}
    );

    if (requested.status !== 'granted') {
      setErrorMessage('Notifications are off, so reminders cannot be scheduled.');
      return false;
    }

    return true;
  };

  const ensureReminderNotificationSetup = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(REMINDER_NOTIFICATION_CHANNEL_ID, {
        name: 'Upcoming Stop Reminders',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.ALARM,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      });
    }
  };

  const cancelReminderForStop = async (stopId: string, ids: ReminderIds = reminderIdsRef.current) => {
    const notificationId = ids[stopId];
    const idsToCancel = new Set<string>();
    if (notificationId) idsToCancel.add(notificationId);

    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const notification of scheduled) {
        const notificationStopId = notification.content.data?.stop_id ?? notification.content.data?.stopId;
        if (notificationStopId?.toString() === stopId) {
          idsToCancel.add(notification.identifier);
        }
      }
    } catch (error) {
      console.log('[UpcomingStops] Failed to inspect reminders before cancel:', error);
    }

    for (const idToCancel of idsToCancel) {
      try {
        await Notifications.cancelScheduledNotificationAsync(idToCancel);
      } catch (error) {
        console.log('[UpcomingStops] Failed to cancel stop reminder:', error);
      }
    }

    const nextIds = { ...ids };
    delete nextIds[stopId];
    setScheduledReminderIds(current => {
      const nextScheduledIds = { ...current };
      delete nextScheduledIds[stopId];
      return nextScheduledIds;
    });
    await persistReminderIds(nextIds);
    return nextIds;
  };

  const scheduleReminderForStop = async (
    stop: UpcomingStop,
    ids: ReminderIds = reminderIdsRef.current,
    settings: ReminderSettings = reminderSettingsRef.current,
    overrideReminderAt?: Date
  ): Promise<ReminderScheduleResult> => {
    const reminderAt = overrideReminderAt ?? getUpcomingStopReminderTime(stop, settings.minutesBefore);
    const now = new Date();

    const idsWithoutOldReminder = await cancelReminderForStop(stop.id, ids);

    if (!settings.enabled) {
      return {
        ids: idsWithoutOldReminder,
      };
    }

    if (REMINDER_CANCEL_STATUSES.includes(stop.status)) {
      return {
        ids: idsWithoutOldReminder,
      };
    }

    if (!reminderAt || reminderAt.getTime() <= now.getTime()) {
      setErrorMessage(`This stop is too soon for a ${settings.minutesBefore}-minute reminder, so no reminder was scheduled.`);
      return {
        ids: idsWithoutOldReminder,
      };
    }

    const hasPermission = await requestLocalNotificationPermission();
    if (!hasPermission) {
      return {
        ids: idsWithoutOldReminder,
      };
    }

    await ensureReminderNotificationSetup();
    const trigger = getReminderNotificationTrigger(reminderAt, now);
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time to Go Live soon',
        body: `${stop.location_text} starts in about ${settings.minutesBefore} minutes. Open TruckTap and go live when you're ready.`,
        data: {
          type: 'upcoming_stop_reminder',
          route: '/(truck)/(tabs)/dashboard',
          truck_id: stop.truck_id,
          stop_id: stop.id,
          location_text: stop.location_text,
          minutes_before: String(settings.minutesBefore),
        },
      },
      trigger,
    });
    setScheduledReminderIds(current => ({
      ...current,
      [stop.id]: notificationId,
    }));

    const nextIds = {
      ...idsWithoutOldReminder,
      [stop.id]: notificationId,
    };
    await persistReminderIds(nextIds);

    return {
      ids: nextIds,
    };
  };

  const hasActiveReminder = (stop: UpcomingStop) => {
    const scheduledNotificationId = scheduledReminderIds[stop.id];
    const reminderAt = getUpcomingStopReminderTime(stop, reminderSettings.minutesBefore);
    const now = new Date();
    const reminderOn = !!(
      reminderSettings.enabled &&
      scheduledNotificationId &&
      !REMINDER_CANCEL_STATUSES.includes(stop.status) &&
      reminderAt &&
      reminderAt.getTime() > now.getTime()
    );

    if (!reminderOn) {
      return false;
    }

    return true;
  };

  const handleReminderToggle = async (enabled: boolean) => {
    setErrorMessage(null);

    if (enabled) {
      const hasPermission = await requestLocalNotificationPermission();
      if (!hasPermission) return;

      const nextSettings = {
        ...reminderSettings,
        enabled: true,
      };
      await persistReminderSettings(nextSettings);

      let nextIds = reminderIdsRef.current;
      for (const stop of stops) {
        if (REMINDER_CANCEL_STATUSES.includes(stop.status)) {
          nextIds = await cancelReminderForStop(stop.id, nextIds);
          continue;
        }
        const scheduleResult = await scheduleReminderForStop(stop, nextIds, nextSettings);
        nextIds = scheduleResult.ids;
      }
      return;
    }

    const nextSettings = {
      ...reminderSettings,
      enabled: false,
    };
    await persistReminderSettings(nextSettings);

    let nextIds = reminderIdsRef.current;
    for (const stopId of Object.keys(reminderIdsRef.current)) {
      nextIds = await cancelReminderForStop(stopId, nextIds);
    }
    await persistReminderIds(nextIds);
  };

  const handleReminderMinutesChange = async (minutesBefore: number) => {
    if (minutesBefore === reminderSettings.minutesBefore) return;

    setErrorMessage(null);
    try {
      const nextSettings = {
        ...reminderSettingsRef.current,
        minutesBefore,
      };
      await persistReminderSettings(nextSettings);

      if (!nextSettings.enabled) return;

      let nextIds = reminderIdsRef.current;
      for (const stop of stops) {
        if (REMINDER_CANCEL_STATUSES.includes(stop.status)) {
          nextIds = await cancelReminderForStop(stop.id, nextIds);
        } else {
          const scheduleResult = await scheduleReminderForStop(
            stop,
            nextIds,
            nextSettings
          );
          nextIds = scheduleResult.ids;
        }
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not update stop reminder timing.'
      );
    }
  };

  const handleConfirmationPreferenceChange = async (enabled: boolean) => {
    setErrorMessage(null);
    setConfirmationPreferenceSaving(true);
    try {
      await setHandsFreeLiveConfirmationNotifications(enabled);
      setAutomationSettings(current => ({
        ...current,
        confirmationNotificationsEnabled: enabled,
      }));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not update confirmation notifications.'
      );
    } finally {
      setConfirmationPreferenceSaving(false);
    }
  };

  const handleTruckDefaultChange = async (enabled: boolean) => {
    if (!truck) return;
    setErrorMessage(null);
    setTruckDefaultSaving(true);
    try {
      await updateTruckDetails(truck.id, { hands_free_live_default_enabled: enabled });
      if (!editingStopId) {
        setHandsFreeLiveOnForNewStop(enabled);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not update the Hands-Free LIVE default.'
      );
    } finally {
      setTruckDefaultSaving(false);
    }
  };

  // Pure resolve-and-confirm step, no stopId, no writes - lets callers
  // decide what to do with the result. Uses cached Saved/Recent-location
  // coordinates directly when they match the current text (no live geocode,
  // no confirmation dialog - a Saved Location's coordinates are trusted);
  // otherwise runs the geocode -> reverse-geocode -> confirm dialog flow.
  // Deliberately independent of Hands-Free LIVE / automation availability -
  // this is the location-confirmation step for a stop, full stop, and is
  // used for every new stop regardless of whether automation is requested
  // or even possible right now.
  //
  // When geocoding finds no match at all, the default (allowUnverified
  // false) is to throw - used by the automation per-stop toggle, where
  // there's no "stop" to fall back to creating. handleSave passes
  // allowUnverified true so a brand-new, unverifiable address offers a
  // choice instead of blocking stop creation outright.
  const resolveConfirmedStopLocation = async (
    stopLocationText: string,
    cachedSource: { text: string; latitude: number; longitude: number; timezone: string } | null,
    options?: { confirmTitle?: string; allowUnverified?: boolean }
  ): Promise<StopLocationResolution> => {
    if (cachedSource && cachedSource.text === stopLocationText) {
      const destination = getDestinationLocation(
        cachedSource.latitude,
        cachedSource.longitude
      );
      return { status: 'confirmed', ...destination };
    }

    if (Platform.OS !== 'web') {
      const existingPermission = await Location.getForegroundPermissionsAsync();
      const permission = existingPermission.status === 'granted'
        ? existingPermission
        : await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error(
          'Location permission is required to verify the scheduled stop address.'
        );
      }
    }

    const matches = await Location.geocodeAsync(stopLocationText);
    const match = matches.find(
      candidate =>
        Number.isFinite(candidate.latitude) &&
        Number.isFinite(candidate.longitude)
    );

    if (!match) {
      if (!options?.allowUnverified) {
        throw new Error(
          'TruckTap could not locate this stop. Use a complete street address.'
        );
      }
      const choice = await confirmUnverifiableLocation(stopLocationText);
      return { status: choice === 'unverified' ? 'unverified' : 'declined' };
    }

    const reverseMatches = await Location.reverseGeocodeAsync({
      latitude: match.latitude,
      longitude: match.longitude,
    }).catch(() => []);
    const destination = getDestinationLocation(
      match.latitude,
      match.longitude,
      reverseMatches[0]?.timezone
    );
    const confirmed = await confirmAutomationLocation(
      stopLocationText,
      formatGeocodedAddress(reverseMatches[0]),
      options?.confirmTitle ?? 'Confirm stop location'
    );
    if (!confirmed) {
      return { status: 'declined' };
    }

    return { status: 'confirmed', ...destination };
  };

  // Thin wrapper around the resolver above, for the per-stop list toggle on
  // an already-existing stop (handleAutomationToggle): resolves/confirms
  // with automation-specific dialog wording, then performs the writes the
  // resolver deliberately doesn't do itself. Returns false unless the
  // location was confirmed - an existing stop has nothing equivalent to
  // "schedule without verified location" to fall back to, so a no-match
  // still throws (allowUnverified defaults to false).
  const enableAutomationForStop = async (
    stopId: string,
    stopLocationText: string,
    cachedSource: { text: string; latitude: number; longitude: number; timezone: string } | null
  ): Promise<boolean> => {
    const resolution = await resolveConfirmedStopLocation(
      stopLocationText,
      cachedSource,
      { confirmTitle: 'Confirm automatic LIVE location' }
    );
    if (resolution.status !== 'confirmed') {
      return false;
    }

    await configureUpcomingStopAutomation({
      stopId,
      enabled: true,
      latitude: resolution.latitude,
      longitude: resolution.longitude,
      timezone: resolution.timezone,
    });
    void persistRecentLocation(stopLocationText, resolution);
    promptSaveLocationIfNew(stopLocationText, resolution.latitude, resolution.longitude, resolution.timezone);
    return true;
  };

  const handleAutomationToggle = async (stop: UpcomingStop, enabled: boolean) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyStopId(stop.id);

    try {
      if (enabled) {
        const didEnable = await enableAutomationForStop(stop.id, stop.location_text, null);
        if (!didEnable) {
          setErrorMessage(
            'Hands-Free LIVE was not enabled because the location was not confirmed. Tap the pencil icon on this stop to correct the address.'
          );
          return;
        }
        setSuccessMessage(`Hands-Free LIVE is ready for ${stop.location_text}.`);
      } else {
        await configureUpcomingStopAutomation({
          stopId: stop.id,
          enabled: false,
        });
        setSuccessMessage(`Hands-Free LIVE is off for ${stop.location_text}.`);
      }

      await refreshAutomationState();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not update Hands-Free LIVE.'
      );
    } finally {
      setBusyStopId(null);
    }
  };

  if (!truck) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Truck not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const resetForm = () => {
    const nextDate = new Date();
    const defaultTimes = getDefaultStopTimes();
    setDateValue(nextDate);
    setSelectedDates([]);
    setStartTime(defaultTimes.start);
    setEndTime(defaultTimes.end);
    setEndsNextDay(false);
    setLocationText('');
    setSelectedLocationSource(null);
    setNote('');
    setActivePicker(null);
    setHandsFreeLiveOnForNewStop(truck?.hands_free_live_default_enabled === true);
  };

  const promptSaveLocationIfNew = (
    locationText: string,
    latitude: number,
    longitude: number,
    timezone: string
  ) => {
    const alreadySaved = savedLocationsForTruck.some(
      location => location.location_text === locationText
    );
    if (alreadySaved || !truck) {
      return;
    }

    Alert.alert(
      'Save this location?',
      `Save "${locationText}" so you can reuse it next time?`,
      [
        { text: 'Skip', style: 'cancel' },
        {
          text: 'Save',
          onPress: () => {
            addSavedLocation({
              truck_id: truck.id,
              label: locationText,
              location_text: locationText,
              latitude,
              longitude,
              timezone,
            }).catch(error => {
              console.log('[UpcomingStops] Failed to save location:', error);
            });
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Populates a stop's coordinates/timezone without blocking the save flow
  // and without a confirmation dialog - unlike Hands-Free LIVE enablement,
  // this is best-effort data for future features, not something that
  // changes the truck's public LIVE status. A failure is recorded (not
  // silently dropped) so the UI can surface it.
  const applyStopLocationInBackground = (
    stopId: string,
    stopLocationText: string,
    cachedSource: { text: string; latitude: number; longitude: number; timezone: string } | null
  ) => {
    if (cachedSource && cachedSource.text === stopLocationText) {
      const destination = getDestinationLocation(
        cachedSource.latitude,
        cachedSource.longitude
      );
      setUpcomingStopLocation({
        stopId,
        ...destination,
      })
        .then(async () => {
          await refreshLocationStatuses();
          promptSaveLocationIfNew(
            stopLocationText,
            destination.latitude,
            destination.longitude,
            destination.timezone
          );
        })
        .catch(error => {
          console.log('[UpcomingStops] Failed to persist saved-location coordinates:', error);
        });
      void persistRecentLocation(stopLocationText, destination);
      return;
    }

    (async () => {
      try {
        const matches = await Location.geocodeAsync(stopLocationText);
        const match = matches.find(
          candidate =>
            Number.isFinite(candidate.latitude) &&
            Number.isFinite(candidate.longitude)
        );
        const destination = match
          ? getDestinationLocation(match.latitude, match.longitude)
          : null;

        if (!destination) {
          await setUpcomingStopLocation({ stopId, failed: true });
          await refreshLocationStatuses();
          return;
        }

        await setUpcomingStopLocation({
          stopId,
          ...destination,
        });
        await refreshLocationStatuses();
        void persistRecentLocation(stopLocationText, destination);
        promptSaveLocationIfNew(
          stopLocationText,
          destination.latitude,
          destination.longitude,
          destination.timezone
        );
      } catch (error) {
        console.log('[UpcomingStops] Background geocode failed:', error);
        try {
          await setUpcomingStopLocation({ stopId, failed: true });
          await refreshLocationStatuses();
        } catch (innerError) {
          console.log('[UpcomingStops] Failed to record geocode failure:', innerError);
        }
      }
    })();
  };

  const applyLocationSelection = (location: SavedLocation) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setLocationText(location.location_text);
    setSelectedLocationSource({
      text: location.location_text,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone,
    });
    locationInputRef.current?.focus();
  };

  const applyRecentLocationText = (text: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setLocationText(text);
    // Recent entries carry cached coordinates once a prior geocode for this
    // exact text has succeeded (see persistRecentLocation) - reuse them to
    // skip a redundant re-geocode, same as picking a Saved Location. Falls
    // back to null (live geocode) for a Recent entry whose geocode never
    // resolved yet.
    const cached = recentLocations.find(entry => entry.text === text);
    setSelectedLocationSource(
      cached && cached.latitude !== undefined && cached.longitude !== undefined && cached.timezone
        ? { text, latitude: cached.latitude, longitude: cached.longitude, timezone: cached.timezone }
        : null
    );
    locationInputRef.current?.focus();
  };

  const openEditSavedLocationModal = (location: SavedLocation) => {
    setEditingSavedLocation(location);
    setSavedLocationFormLabel(location.label);
    setSavedLocationFormText(location.location_text);
    setSavedLocationModalError(null);
    setSavedLocationModalVisible(true);
  };

  const closeSavedLocationModal = () => {
    setSavedLocationModalVisible(false);
    setEditingSavedLocation(null);
    setSavedLocationFormLabel('');
    setSavedLocationFormText('');
    setSavedLocationModalError(null);
  };

  const handleUpdateSavedLocation = async () => {
    if (!editingSavedLocation) return;
    setSavedLocationModalError(null);

    const nextLabel = savedLocationFormLabel.trim();
    const nextText = savedLocationFormText.trim();

    if (!nextLabel) {
      setSavedLocationModalError('A name for this location is required.');
      return;
    }
    if (!nextText) {
      setSavedLocationModalError('Location is required.');
      return;
    }

    setSavedLocationSaving(true);
    try {
      const addressChanged = nextText !== editingSavedLocation.location_text;

      if (!addressChanged) {
        // Label-only rename - the coordinates are still valid, no re-geocode needed.
        if (nextLabel !== editingSavedLocation.label) {
          await updateSavedLocation(editingSavedLocation.id, { label: nextLabel });
        }
        closeSavedLocationModal();
        return;
      }

      // Address text changed - re-geocode and confirm before saving, same
      // pattern used for Hands-Free LIVE, just with a neutral title since
      // this has nothing to do with automation.
      const matches = await Location.geocodeAsync(nextText);
      const match = matches.find(
        candidate =>
          Number.isFinite(candidate.latitude) &&
          Number.isFinite(candidate.longitude)
      );

      if (!match) {
        setSavedLocationModalError(
          'TruckTap could not locate this address. Try a more complete street address.'
        );
        return;
      }

      const reverseMatches = await Location.reverseGeocodeAsync({
        latitude: match.latitude,
        longitude: match.longitude,
      }).catch(() => []);
      const confirmed = await confirmAutomationLocation(
        nextText,
        formatGeocodedAddress(reverseMatches[0]),
        'Confirm location'
      );
      if (!confirmed) {
        return;
      }

      const destination = getDestinationLocation(
        match.latitude,
        match.longitude,
        reverseMatches[0]?.timezone
      );
      await updateSavedLocation(editingSavedLocation.id, {
        label: nextLabel,
        location_text: nextText,
        ...destination,
      });
      closeSavedLocationModal();
    } catch (error) {
      setSavedLocationModalError(
        error instanceof Error ? error.message : 'Could not update this location.'
      );
    } finally {
      setSavedLocationSaving(false);
    }
  };

  const handleDeleteSavedLocation = () => {
    if (!editingSavedLocation) return;
    const location = editingSavedLocation;

    Alert.alert(
      'Delete saved location?',
      `Remove "${location.label}" from your saved locations? Stops that already used this address are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSavedLocationDeleting(true);
            try {
              await deleteSavedLocation(location.id);
              closeSavedLocationModal();
            } catch (error) {
              setSavedLocationModalError(
                error instanceof Error ? error.message : 'Could not delete this location.'
              );
            } finally {
              setSavedLocationDeleting(false);
            }
          },
        },
      ]
    );
  };

  const buildDateRange = (selectedDate: Date) => {
    const startsAt = combineDateAndTime(selectedDate, startTime);
    const endsAt = combineDateAndTime(selectedDate, endTime);

    if (endsNextDay) {
      endsAt.setDate(endsAt.getDate() + 1);
    }

    if (endsAt <= startsAt) {
      throw new Error('Choose a later end time, or turn on Overnight stop.');
    }

    return { startsAt, endsAt };
  };

  const addSelectedDate = (date: Date) => {
    const dateToAdd = startOfSelectedDate(date);

    if (editingStopId) {
      setSelectedDates([dateToAdd]);
      return;
    }

    setSelectedDates(current => {
      const dateKey = getDateKey(dateToAdd);

      if (current.some(date => getDateKey(date) === dateKey)) {
        return current;
      }

      return [...current, dateToAdd].sort((a, b) => a.getTime() - b.getTime());
    });
  };

  const handleRemoveSelectedDate = (dateToRemove: Date) => {
    setSuccessMessage(null);
    setSelectedDates(current =>
      current.filter(date => getDateKey(date) !== getDateKey(dateToRemove))
    );
  };

  const handlePickerChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS !== 'ios') {
      setActivePicker(null);
    }

    if (!selectedDate || !activePicker) {
      return;
    }

    if (activePicker === 'date') {
      setDateValue(selectedDate);
      setErrorMessage(null);
      setSuccessMessage(null);
      addSelectedDate(selectedDate);
    } else if (activePicker === 'start') {
      setStartTime(selectedDate);
    } else if (activePicker === 'end') {
      setEndTime(selectedDate);
    }
  };

  const handleStartPeriodChange = (period: TimePeriod) => {
    setStartTime(current => withTimePeriod(current, period));
  };

  const handleEndPeriodChange = (period: TimePeriod) => {
    setEndTime(current => withTimePeriod(current, period));
  };

  const pickerValue =
    activePicker === 'date' ? dateValue :
    activePicker === 'start' ? startTime :
    activePicker === 'end' ? endTime :
    dateValue;

  const pickerMode = activePicker === 'date' ? 'date' : 'time';
  const stopDurationMinutes = getStopDurationMinutes(startTime, endTime, endsNextDay);
  const stopDurationLabel = formatStopDuration(stopDurationMinutes);
  const invalidSameDayTimeRange = !endsNextDay && stopDurationMinutes === null;

  const handleEditStop = (stop: UpcomingStop) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const startsAtDate = new Date(stop.starts_at);
    const endsAtDate = new Date(stop.ends_at);
    const stopDate = startOfSelectedDate(startsAtDate);

    setEditingStopId(stop.id);
    setDateValue(startsAtDate);
    setSelectedDates([stopDate]);
    setStartTime(startsAtDate);
    setEndTime(endsAtDate);
    setEndsNextDay(getDateKey(startOfSelectedDate(endsAtDate)) !== getDateKey(stopDate));
    setLocationText(stop.location_text);
    setSelectedLocationSource(null);
    setNote(stop.note ?? '');
    setActivePicker(null);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleCancelEdit = () => {
    setEditingStopId(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    resetForm();
  };

  const handleSave = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const locationSourceAtSave = selectedLocationSource;
    const handsFreeLiveRequestedAtSave = !editingStopId && handsFreeLiveOnForNewStop;
    // Mirrors the same "system_enabled" check the configure_upcoming_stop_
    // live_automation RPC enforces server-side (see the migration) - if the
    // owner's truck-level default or per-stop switch is on but the feature
    // is globally paused, the RPC would reject the request. Checking this
    // up front means we simply never attempt it, instead of attempting and
    // having a "Hands-Free LIVE is temporarily unavailable" throw abort an
    // otherwise-successful stop creation.
    const handsFreeLiveSystemAvailable = automationSettings.supported && automationSettings.systemEnabled;
    const handsFreeLiveOnAtSave = handsFreeLiveRequestedAtSave && handsFreeLiveSystemAvailable;
    const handsFreeLivePausedAtSave = handsFreeLiveRequestedAtSave && !handsFreeLiveSystemAvailable;

    try {
      const trimmedLocation = locationText.trim();
      if (!trimmedLocation) {
        throw new Error('Location name or address is required.');
      }
      if (selectedDates.length === 0) {
        throw new Error('Select at least one date for this stop.');
      }
      if (!reminderSettingsLoaded) {
        throw new Error('Reminder settings are still loading. Please try again.');
      }

      const currentSettings = reminderSettingsRef.current;
      setIsSaving(true);

      if (editingStopId) {
        const previousStop = stops.find(stop => stop.id === editingStopId);
        const { startsAt, endsAt } = buildDateRange(selectedDates[0]);

        const updatedStop = await updateUpcomingStop(editingStopId, {
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          location_text: trimmedLocation,
          note: note.trim() || null,
        });

        if (currentSettings.enabled) {
          await scheduleReminderForStop(updatedStop, reminderIdsRef.current, currentSettings);
        } else {
          await cancelReminderForStop(editingStopId, reminderIdsRef.current);
        }

        if (previousStop && previousStop.location_text !== trimmedLocation) {
          if (automationStatuses[editingStopId]?.enabled) {
            await configureUpcomingStopAutomation({ stopId: editingStopId, enabled: false });
            await refreshAutomationState();
          }
          applyStopLocationInBackground(editingStopId, trimmedLocation, locationSourceAtSave);
          void persistRecentLocation(trimmedLocation);
        }

        setSuccessMessage('Stop updated.');
        setEditingStopId(null);
        resetForm();
      } else {
        const dateRanges = selectedDates.map(selectedDate => buildDateRange(selectedDate));

        // Resolve and confirm this stop's location ONCE, up front, before a
        // single upcoming_stops row is created - not per date, and not
        // after rows already exist. This runs for every new stop
        // regardless of Hands-Free LIVE: location confirmation is not an
        // automation feature and must not be skipped just because
        // automation is off, paused, or unsupported. "declined" means
        // nothing has been created yet: return silently to the still-open,
        // still-filled form. No stop, no coordinates, no Save-Location
        // prompt, no banner. "unverified" means the owner chose to
        // schedule anyway despite an address that didn't geocode to
        // anything - the stop still gets created, just without
        // coordinates or Hands-Free LIVE.
        const resolution = await resolveConfirmedStopLocation(
          trimmedLocation,
          locationSourceAtSave,
          { allowUnverified: true }
        );

        if (resolution.status === 'declined') {
          return;
        }

        const resolvedLocation = resolution.status === 'confirmed' ? resolution : null;

        const createdStops: UpcomingStop[] = [];
        // Recorded once for the whole batch - every date in a multi-date
        // save shares the same location text. Only reached once the
        // location step above has settled. An unverified address still
        // gets remembered as Recent (just without coordinates), matching
        // how a Recent entry that's never resolved already behaves.
        void persistRecentLocation(trimmedLocation, resolvedLocation ?? undefined);

        for (const { startsAt, endsAt } of dateRanges) {
          const createdStop = await addUpcomingStop({
            truck_id: truck.id,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            location_text: trimmedLocation,
            note: note.trim() || null,
            status: 'scheduled',
          });

          createdStops.push(createdStop);

          // The stop row already exists at this point, so from here down
          // every step is a noncritical enhancement: a failure in any of
          // them must not abort the loop, the save-location prompt, the
          // success message, or resetForm - otherwise the owner is left
          // looking at a "failed" save (and a still-filled form inviting a
          // duplicate resubmit) for a stop that was actually created fine.
          try {
            if (resolvedLocation) {
              await setUpcomingStopLocation({
                stopId: createdStop.id,
                ...resolvedLocation,
              });
            } else {
              // Unverified: leave lat/lng/timezone null and mark it failed
              // so the stop card shows the existing "Location couldn't be
              // verified" caption, same as a background geocode failure.
              await setUpcomingStopLocation({ stopId: createdStop.id, failed: true });
            }
            await refreshLocationStatuses();
          } catch (locationError) {
            console.log('[UpcomingStops] Failed to persist stop coordinates:', locationError);
          }

          if (currentSettings.enabled) {
            try {
              await scheduleReminderForStop(createdStop, reminderIdsRef.current, currentSettings);
            } catch (reminderError) {
              console.log('[UpcomingStops] Failed to schedule reminder for new stop:', reminderError);
            }
          }

          // Hands-Free LIVE is a separate, optional decision layered on top
          // of the already-confirmed location - not attempted at all while
          // the system is paused/disabled (see handsFreeLiveSystemAvailable
          // above), even if the truck-level default/per-stop switch is on,
          // and not attempted for an unverified location (no coordinates
          // to enable it with).
          if (handsFreeLiveOnAtSave && resolvedLocation) {
            try {
              await configureUpcomingStopAutomation({
                stopId: createdStop.id,
                enabled: true,
                latitude: resolvedLocation.latitude,
                longitude: resolvedLocation.longitude,
                timezone: resolvedLocation.timezone,
              });
            } catch (automationError) {
              console.log('[UpcomingStops] Could not enable Hands-Free LIVE for new stop:', automationError);
            }
          }
        }

        if (handsFreeLiveOnAtSave && resolvedLocation) {
          await refreshAutomationState();
        }

        // Nothing to offer saving for an unverified location - there are
        // no coordinates to save.
        if (resolvedLocation) {
          promptSaveLocationIfNew(
            trimmedLocation,
            resolvedLocation.latitude,
            resolvedLocation.longitude,
            resolvedLocation.timezone
          );
        }

        const baseMessage = createdStops.length > 1
          ? `${createdStops.length} stops scheduled.`
          : 'Stop scheduled.';
        const pausedNotice = handsFreeLivePausedAtSave
          ? ' Hands-Free LIVE was not turned on because the feature is temporarily paused.'
          : '';
        setSuccessMessage(`${baseMessage}${pausedNotice}`);
        resetForm();
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }
    } catch (error: any) {
      setErrorMessage(error?.message ?? 'Could not save upcoming stop.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (stop: UpcomingStop, status: UpcomingStopStatus) => {
    setErrorMessage(null);
    setBusyStopId(stop.id);

    try {
      if (
        status !== 'scheduled' &&
        automationStatuses[stop.id]?.enabled
      ) {
        await configureUpcomingStopAutomation({
          stopId: stop.id,
          enabled: false,
        });
      }

      await updateUpcomingStop(stop.id, { status });
      const updatedStop = { ...stop, status };

      if (REMINDER_CANCEL_STATUSES.includes(status)) {
        await cancelReminderForStop(stop.id, reminderIdsRef.current);
      } else if (reminderSettingsRef.current.enabled) {
        await scheduleReminderForStop(updatedStop, reminderIdsRef.current, reminderSettingsRef.current);
      }
      await refreshAutomationState();
    } catch (error: any) {
      setErrorMessage(error?.message ?? 'Could not update stop status.');
    } finally {
      setBusyStopId(null);
    }
  };

  const handleDelete = (stop: UpcomingStop) => {
    Alert.alert(
      'Delete stop?',
      'This removes the upcoming stop from your customer profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setErrorMessage(null);
            setBusyStopId(stop.id);

            try {
              await deleteUpcomingStop(stop.id);
              await cancelReminderForStop(stop.id, reminderIdsRef.current);
              if (editingStopId === stop.id) {
                handleCancelEdit();
              }
            } catch (error: any) {
              setErrorMessage(error?.message ?? 'Could not delete upcoming stop.');
            } finally {
              setBusyStopId(null);
            }
          },
        },
      ]
    );
  };

  // Sits in the form header next to "Add planned stop" / "Edit planned
  // stop", so an owner reasonably reads it as "clear this form and start
  // over" - it must actually do that, not silently refetch server data
  // behind an icon that looks like a reset button. The server refresh this
  // button used to perform is still useful (nothing else on this screen
  // re-polls automation/stop state), so it still runs - just in the
  // background, after the form has already visibly cleared, not as the
  // button's primary effect.
  const handleResetForm = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingStopId(null);
    resetForm();
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });

    Promise.all([
      refreshUpcomingStops(),
      refreshAutomationState(),
    ]).catch((error: any) => {
      setErrorMessage(error?.message ?? 'Could not refresh upcoming stops.');
    });
  };

  const handleGoLiveFromStop = (stop: UpcomingStop) => {
    router.push({
      pathname: '/(truck)/update-location',
      params: {
        stopId: stop.id,
        stopLocation: stop.location_text,
      },
    } as any);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderTextContainer}>
                <Text style={styles.reminderTitle}>Remind me before upcoming stops</Text>
                <Text style={styles.reminderSubtitle}>
                  Reminder: {reminderSettings.minutesBefore} minutes before
                </Text>
              </View>
              <Switch
                value={reminderSettings.enabled}
                onValueChange={handleReminderToggle}
                disabled={!reminderSettingsLoaded}
                trackColor={{ false: Colors.lightGray, true: `${Colors.primary}55` }}
                thumbColor={reminderSettings.enabled ? Colors.primary : Colors.gray}
              />
            </View>
            <View style={styles.reminderMinuteRow}>
              {REMINDER_MINUTE_OPTIONS.map(minutes => (
                <TouchableOpacity
                  key={minutes}
                  style={[
                    styles.reminderMinuteChip,
                    reminderSettings.minutesBefore === minutes &&
                      styles.reminderMinuteChipActive,
                  ]}
                  onPress={() => void handleReminderMinutesChange(minutes)}
                  disabled={!reminderSettingsLoaded}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.reminderMinuteText,
                      reminderSettings.minutesBefore === minutes &&
                        styles.reminderMinuteTextActive,
                    ]}
                  >
                    {minutes} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {automationSettings.supported ? (
            <View style={styles.automationOverviewCard}>
              <View style={styles.automationOverviewHeader}>
                <View style={styles.automationIcon}>
                  <Zap size={20} color={Colors.primary} />
                </View>
                <View style={styles.reminderTextContainer}>
                  <Text style={styles.reminderTitle}>Hands-Free LIVE</Text>
                  <Text style={styles.reminderSubtitle}>
                    {automationSettings.systemEnabled
                      ? `Starts within a ${automationSettings.startGraceMinutes}-minute grace period and stops ${automationSettings.endGraceMinutes} minutes after the scheduled end.`
                      : 'Scheduled automation is temporarily paused by TruckTap.'}
                  </Text>
                </View>
                {automationLoading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : null}
              </View>
              <View style={styles.confirmationRow}>
                <Bell size={18} color={Colors.primary} />
                <View style={styles.reminderTextContainer}>
                  <Text style={styles.confirmationTitle}>Confirmation notifications</Text>
                  <Text style={styles.confirmationSubtitle}>
                    Get a push after automatic Go LIVE and Stop Serving.
                  </Text>
                </View>
                <Switch
                  value={automationSettings.confirmationNotificationsEnabled}
                  onValueChange={value => void handleConfirmationPreferenceChange(value)}
                  disabled={confirmationPreferenceSaving}
                  trackColor={{ false: Colors.lightGray, true: `${Colors.primary}55` }}
                  thumbColor={
                    automationSettings.confirmationNotificationsEnabled
                      ? Colors.primary
                      : Colors.gray
                  }
                />
              </View>
              <View style={styles.confirmationRow}>
                <Zap size={18} color={Colors.primary} />
                <View style={styles.reminderTextContainer}>
                  <Text style={styles.confirmationTitle}>Default for new stops</Text>
                  <Text style={styles.confirmationSubtitle}>
                    {automationSettings.systemEnabled
                      ? 'Turn on Hands-Free LIVE for new stops by default. Each stop can still be switched off individually.'
                      : 'Scheduled automation is temporarily paused, so this default cannot be changed right now.'}
                  </Text>
                </View>
                <Switch
                  value={truck.hands_free_live_default_enabled === true}
                  onValueChange={value => void handleTruckDefaultChange(value)}
                  disabled={truckDefaultSaving || !automationSettings.systemEnabled}
                  trackColor={{ false: Colors.lightGray, true: `${Colors.primary}55` }}
                  thumbColor={truck.hands_free_live_default_enabled ? Colors.primary : Colors.gray}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.formTitleRow}>
                <CalendarDays size={24} color={Colors.primary} />
                <Text style={styles.formTitle}>{editingStopId ? 'Edit planned stop' : 'Add planned stop'}</Text>
              </View>
              <TouchableOpacity onPress={handleResetForm} style={styles.refreshButton} activeOpacity={0.75}>
                <RefreshCw size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Date</Text>
            <PickerButton
              icon={CalendarDays}
              value={formatDateButton(dateValue)}
              onPress={() => setActivePicker(activePicker === 'date' ? null : 'date')}
            />

            <View style={styles.selectedDatesCard}>
              <View style={styles.selectedDatesHeader}>
                <View>
                  <Text style={styles.selectedDatesTitle}>Selected Dates</Text>
                  <Text style={styles.selectedDatesSubtitle}>
                    {editingStopId ? 'Tap the date above to change it.' : 'Tap a date above to add it.'}
                  </Text>
                  {!editingStopId ? (
                    <Text style={styles.selectedDatesHelper}>
                      Select multiple dates to create stops with the same location and hours.
                    </Text>
                  ) : null}
                </View>
              </View>
              {selectedDates.length > 0 ? (
                <View style={styles.selectedDateList}>
                  {selectedDates.map(selectedDate => (
                    <View key={getDateKey(selectedDate)} style={styles.selectedDateChip}>
                      <Text style={styles.selectedDateText}>{formatSelectedDate(selectedDate)}</Text>
                      <TouchableOpacity
                        style={styles.removeDateButton}
                        onPress={() => handleRemoveSelectedDate(selectedDate)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.removeDateButtonText}>x</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.noSelectedDatesText}>
                  No date selected - pick a date above before saving.
                </Text>
              )}
            </View>

            <View style={styles.timeRow}>
              <View style={styles.timeInputGroup}>
                <Text style={styles.label}>Start</Text>
                <PickerButton
                  icon={Clock}
                  value={formatTimeButton(startTime)}
                  onPress={() => setActivePicker(activePicker === 'start' ? null : 'start')}
                />
                <PeriodSegmentedControl
                  value={getTimePeriod(startTime)}
                  onChange={handleStartPeriodChange}
                />
              </View>
              <View style={styles.timeInputGroup}>
                <Text style={styles.label}>End</Text>
                <PickerButton
                  icon={Clock}
                  value={formatTimeButton(endTime)}
                  onPress={() => setActivePicker(activePicker === 'end' ? null : 'end')}
                />
                <PeriodSegmentedControl
                  value={getTimePeriod(endTime)}
                  onChange={handleEndPeriodChange}
                />
              </View>
            </View>

            <View style={styles.timeSummary}>
              <View style={styles.timeSummaryItem}>
                <Text style={styles.timeSummaryLabel}>Start</Text>
                <Text style={styles.timeSummaryValue}>{formatTimeButton(startTime)}</Text>
              </View>
              <View style={styles.timeSummaryDivider} />
              <View style={styles.timeSummaryItem}>
                <Text style={styles.timeSummaryLabel}>
                  {endsNextDay ? 'End (next day)' : 'End'}
                </Text>
                <Text style={styles.timeSummaryValue}>{formatTimeButton(endTime)}</Text>
              </View>
            </View>
            <Text
              style={[
                styles.durationSummary,
                invalidSameDayTimeRange && styles.durationSummaryInvalid,
              ]}
            >
              {stopDurationLabel
                ? `Duration: ${stopDurationLabel}`
                : 'End time must be later than start time.'}
            </Text>

            {activePicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={pickerValue}
                  mode={pickerMode}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handlePickerChange}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    style={styles.pickerDoneButton}
                    onPress={() => setActivePicker(null)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.pickerDoneText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={[styles.overnightControl, endsNextDay && styles.overnightControlOn]}>
              <View style={styles.overnightTextGroup}>
                <Text style={[styles.overnightTitle, endsNextDay && styles.overnightTitleOn]}>
                  Overnight stop
                </Text>
                <Text style={[styles.overnightDetail, endsNextDay && styles.overnightDetailOn]}>
                  {endsNextDay
                    ? 'End is on the following day.'
                    : 'Start and end are on the same day.'}
                </Text>
              </View>
              <Switch
                value={endsNextDay}
                onValueChange={setEndsNextDay}
                trackColor={{ false: Colors.lightGray, true: `${Colors.light}88` }}
                thumbColor={endsNextDay ? Colors.light : Colors.gray}
              />
            </View>

            {invalidSameDayTimeRange ? (
              <Text style={styles.overnightValidation}>
                Choose a later end time, or turn on Overnight stop.
              </Text>
            ) : null}

            {recentLocationTexts.length > 0 && (
              <View style={styles.locationChipSection}>
                <View style={styles.locationChipSectionHeader}>
                  <Text style={styles.locationChipSectionLabel}>Recent</Text>
                  <TouchableOpacity
                    onPress={handleClearAllRecentLocations}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.clearAllRecentsText}>Clear all</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.locationChipRow}>
                  {recentLocationTexts.map(text => (
                    <View key={text} style={[styles.locationChip, styles.savedLocationChip]}>
                      <TouchableOpacity
                        style={styles.locationChipSelectArea}
                        onPress={() => applyRecentLocationText(text)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.locationChipText} numberOfLines={1}>{text}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.locationChipEditButton}
                        onPress={() => handleDeleteRecentLocation(text)}
                        activeOpacity={0.75}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Trash2 size={13} color={Colors.gray} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {savedLocationsForTruck.length > 0 && (
              <View style={styles.locationChipSection}>
                <Text style={styles.locationChipSectionLabel}>Saved</Text>
                <View style={styles.locationChipRow}>
                  {savedLocationsForTruck.map(location => (
                    <View key={location.id} style={[styles.locationChip, styles.savedLocationChip]}>
                      <TouchableOpacity
                        style={styles.locationChipSelectArea}
                        onPress={() => applyLocationSelection(location)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.locationChipText} numberOfLines={1}>{location.label}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.locationChipEditButton}
                        onPress={() => openEditSavedLocationModal(location)}
                        activeOpacity={0.75}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        disabled={isSaving}
                      >
                        <Pencil size={13} color={Colors.gray} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <Text style={styles.label}>Location name or address</Text>
            <TextInput
              ref={locationInputRef}
              style={styles.input}
              value={locationText}
              onChangeText={setLocationText}
              placeholder="Downtown farmers market"
              placeholderTextColor={Colors.gray}
              autoCapitalize="words"
            />
            <Text style={styles.locationHelperText}>
              For best results, enter the full street address. Business-name searches may return the wrong location.
            </Text>

            <Text style={styles.label}>Note</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder="Optional note"
              placeholderTextColor={Colors.gray}
              multiline
              textAlignVertical="top"
            />

            {!editingStopId && automationSettings.supported && automationSettings.systemEnabled ? (
              <View style={styles.newStopAutomationRow}>
                <View style={styles.newStopAutomationTextGroup}>
                  <Text style={styles.newStopAutomationLabel}>Hands-Free LIVE for this stop</Text>
                  <Text style={styles.newStopAutomationDetail}>
                    TruckTap goes live and off for you automatically - no action needed.
                  </Text>
                </View>
                <Switch
                  value={handsFreeLiveOnForNewStop}
                  onValueChange={setHandsFreeLiveOnForNewStop}
                  trackColor={{ false: Colors.lightGray, true: `${Colors.primary}55` }}
                  thumbColor={handsFreeLiveOnForNewStop ? Colors.primary : Colors.gray}
                />
              </View>
            ) : null}

            {errorMessage ? (
              <Text style={styles.errorMessage}>{errorMessage}</Text>
            ) : null}
            {successMessage ? (
              <Text style={styles.successMessage}>{successMessage}</Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.saveButton,
                (
                  isSaving ||
                  !reminderSettingsLoaded ||
                  selectedDates.length === 0 ||
                  invalidSameDayTimeRange
                ) && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={
                isSaving ||
                !reminderSettingsLoaded ||
                selectedDates.length === 0 ||
                invalidSameDayTimeRange
              }
              activeOpacity={0.75}
            >
              {isSaving ? (
                <ActivityIndicator color={Colors.light} />
              ) : (
                <Text style={styles.saveButtonText}>{editingStopId ? 'Save Changes' : 'Save Stop'}</Text>
              )}
            </TouchableOpacity>

            {editingStopId ? (
              <TouchableOpacity
                style={styles.cancelEditButton}
                onPress={handleCancelEdit}
                disabled={isSaving}
                activeOpacity={0.75}
              >
                <Text style={styles.cancelEditButtonText}>Cancel Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Your Stops</Text>
            <Text style={styles.listCount}>{stops.length}</Text>
          </View>

          {stops.length === 0 ? (
            <View style={styles.emptyState}>
              <MapPin size={56} color={Colors.lightGray} />
              <Text style={styles.emptyTitle}>No upcoming stops yet</Text>
              <Text style={styles.emptySubtitle}>Add the stops you already know about so customers can plan ahead.</Text>
            </View>
          ) : (
            stops.map(stop => (
              <StopCard
                key={stop.id}
                stop={stop}
                busy={busyStopId === stop.id}
                reminderOn={hasActiveReminder(stop)}
                truckOpenNow={truck.open_now}
                nowMs={nowMs}
                automationSupported={automationSettings.supported}
                automationSystemEnabled={automationSettings.systemEnabled}
                automationStatus={automationStatuses[stop.id] ?? null}
                locationVerificationFailed={locationStatuses[stop.id]?.geocodeFailedAt != null}
                onStatusChange={handleStatusChange}
                onEdit={handleEditStop}
                onDelete={handleDelete}
                onGoLive={handleGoLiveFromStop}
                onAutomationToggle={handleAutomationToggle}
              />
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={savedLocationModalVisible}
        animationType="slide"
        transparent={false}
        presentationStyle="pageSheet"
        onRequestClose={closeSavedLocationModal}
      >
        <SafeAreaView style={styles.savedLocationModalContainer} edges={['top']}>
          <View style={styles.savedLocationModalHeader}>
            <Text style={styles.savedLocationModalTitle}>Edit Saved Location</Text>
            <TouchableOpacity onPress={closeSavedLocationModal} style={styles.savedLocationModalClose}>
              <X size={22} color={Colors.dark} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.savedLocationModalFlex}
          >
            <ScrollView
              style={styles.savedLocationModalContent}
              contentContainerStyle={styles.savedLocationModalContentContainer}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={savedLocationFormLabel}
                onChangeText={setSavedLocationFormLabel}
                placeholder="e.g. Downtown Farmers Market"
                placeholderTextColor={Colors.gray}
              />

              <Text style={styles.label}>Location name or address</Text>
              <TextInput
                style={styles.input}
                value={savedLocationFormText}
                onChangeText={setSavedLocationFormText}
                placeholder="Full street address"
                placeholderTextColor={Colors.gray}
                autoCapitalize="words"
              />

              {savedLocationModalError ? (
                <Text style={styles.errorMessage}>{savedLocationModalError}</Text>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (savedLocationSaving || savedLocationDeleting) && styles.buttonDisabled,
                ]}
                onPress={handleUpdateSavedLocation}
                disabled={savedLocationSaving || savedLocationDeleting}
                activeOpacity={0.75}
              >
                {savedLocationSaving ? (
                  <ActivityIndicator color={Colors.light} />
                ) : (
                  <Text style={styles.saveButtonText}>Update Location</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteSavedLocationButton}
                onPress={handleDeleteSavedLocation}
                disabled={savedLocationSaving || savedLocationDeleting}
                activeOpacity={0.75}
              >
                {savedLocationDeleting ? (
                  <ActivityIndicator color={Colors.danger} />
                ) : (
                  <>
                    <Trash2 size={18} color={Colors.danger} />
                    <Text style={styles.deleteSavedLocationButtonText}>Delete Location</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

type StopCardProps = {
  stop: UpcomingStop;
  busy: boolean;
  reminderOn: boolean;
  truckOpenNow: boolean;
  nowMs: number;
  automationSupported: boolean;
  automationSystemEnabled: boolean;
  automationStatus: UpcomingStopAutomationStatus | null;
  locationVerificationFailed: boolean;
  onStatusChange: (stop: UpcomingStop, status: UpcomingStopStatus) => void;
  onEdit: (stop: UpcomingStop) => void;
  onDelete: (stop: UpcomingStop) => void;
  onGoLive: (stop: UpcomingStop) => void;
  onAutomationToggle: (stop: UpcomingStop, enabled: boolean) => void;
};

type PickerButtonProps = {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  value: string;
  onPress: () => void;
};

type PeriodSegmentedControlProps = {
  value: TimePeriod;
  onChange: (period: TimePeriod) => void;
};

function PickerButton({ icon: Icon, value, onPress }: PickerButtonProps) {
  return (
    <TouchableOpacity style={styles.pickerButton} onPress={onPress} activeOpacity={0.75}>
      <Icon size={18} color={Colors.primary} />
      <Text style={styles.pickerButtonText}>{value}</Text>
      <ChevronDown size={18} color={Colors.gray} />
    </TouchableOpacity>
  );
}

function PeriodSegmentedControl({ value, onChange }: PeriodSegmentedControlProps) {
  return (
    <View style={styles.periodSegmentedControl}>
      {(['AM', 'PM'] as TimePeriod[]).map(period => {
        const selected = value === period;

        return (
          <TouchableOpacity
            key={period}
            style={[styles.periodSegment, selected && styles.periodSegmentSelected]}
            onPress={() => onChange(period)}
            activeOpacity={0.8}
          >
            <Text style={[styles.periodSegmentText, selected && styles.periodSegmentTextSelected]}>
              {period}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StopCard({
  stop,
  busy,
  reminderOn,
  truckOpenNow,
  nowMs,
  automationSupported,
  automationSystemEnabled,
  automationStatus,
  locationVerificationFailed,
  onStatusChange,
  onEdit,
  onDelete,
  onGoLive,
  onAutomationToggle,
}: StopCardProps) {
  const statusColor = getStatusColor(stop.status);
  const ended = Date.parse(stop.ends_at) <= nowMs;
  const showGoLiveAction = canStopGoLive(stop, nowMs);
  const automationEnabled = automationStatus?.enabled === true;
  const canEnableAutomation =
    automationSystemEnabled &&
    stop.status === 'scheduled' &&
    Date.parse(stop.starts_at) > nowMs;

  return (
    <View style={styles.stopCard}>
      <View style={styles.stopHeader}>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabels[stop.status]}
          </Text>
        </View>
        <View style={[styles.reminderBadge, reminderOn ? styles.reminderBadgeOn : styles.reminderBadgeOff]}>
          <Text style={[styles.reminderBadgeText, reminderOn ? styles.reminderBadgeTextOn : styles.reminderBadgeTextOff]}>
            {reminderOn ? 'Reminder On' : 'Reminder Off'}
          </Text>
        </View>
        {ended ? <Text style={styles.endedText}>Ended</Text> : null}
        <View style={styles.stopHeaderActions}>
          <TouchableOpacity
            style={styles.iconActionButton}
            onPress={() => onEdit(stop)}
            disabled={busy}
            activeOpacity={0.75}
          >
            <Pencil size={18} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconActionButton}
            onPress={() => onDelete(stop)}
            disabled={busy}
            activeOpacity={0.75}
          >
            {busy ? <ActivityIndicator size="small" color={Colors.gray} /> : <Trash2 size={18} color={Colors.danger} />}
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.controlClarifyingCaption}>
        {reminderOn && automationEnabled
          ? "We'll send a phone alert, but Hands-Free LIVE already handles this stop automatically - the alert is just a backup."
          : "We'll send a phone alert - you still tap Go Live yourself."}
      </Text>

      <Text style={styles.stopTime}>{formatDateTime(stop.starts_at)} - {formatDateTime(stop.ends_at)}</Text>
      <Text style={styles.stopLocation}>{stop.location_text}</Text>
      {locationVerificationFailed ? (
        <Text style={styles.locationVerificationCaption}>
          Location couldn't be verified — edit to try again
        </Text>
      ) : null}
      {stop.note ? <Text style={styles.stopNote}>{stop.note}</Text> : null}

      {automationSupported ? (
        <View style={styles.stopAutomationPanel}>
          <View style={styles.stopAutomationHeader}>
            <View style={styles.stopAutomationTitleRow}>
              <Zap
                size={17}
                color={automationEnabled ? Colors.primary : Colors.gray}
              />
              <Text style={styles.stopAutomationTitle}>Hands-Free LIVE</Text>
            </View>
            <Switch
              value={automationEnabled}
              onValueChange={enabled => onAutomationToggle(stop, enabled)}
              disabled={busy || (!automationEnabled && !canEnableAutomation)}
              trackColor={{ false: Colors.lightGray, true: `${Colors.primary}55` }}
              thumbColor={automationEnabled ? Colors.primary : Colors.gray}
            />
          </View>
          <Text style={styles.controlClarifyingCaption}>
            TruckTap goes live and off for you automatically - no action needed.
          </Text>
          <Text
            style={[
              styles.automationStatusLabel,
              automationEnabled && styles.automationStatusLabelActive,
            ]}
          >
            {automationStatus?.statusLabel ??
              (canEnableAutomation ? 'Off' : 'Unavailable for this stop')}
          </Text>
          <Text style={styles.automationStatusDetail}>
            {automationStatus?.statusDetail ??
              (
                canEnableAutomation
                  ? 'Turn it on to use this stop location automatically.'
                  : ended
                    ? 'This stop has already ended.'
                    : 'Hands-Free LIVE requires a future scheduled stop.'
              )}
          </Text>
        </View>
      ) : null}

      {showGoLiveAction ? (
        <View style={styles.goLivePanel}>
          {!truckOpenNow ? <Text style={styles.goLiveReadyText}>Ready to Go LIVE</Text> : null}
          <TouchableOpacity
            style={[styles.goLiveButton, truckOpenNow && styles.liveNowButton]}
            onPress={() => onGoLive(stop)}
            disabled={busy || truckOpenNow}
            activeOpacity={0.75}
          >
            <Text style={[styles.goLiveButtonText, truckOpenNow && styles.liveNowButtonText]}>
              {truckOpenNow ? '\uD83D\uDFE2 LIVE NOW' : '\uD83D\uDE9A Go LIVE'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.statusRow}>
        {STATUSES.map(status => (
          <TouchableOpacity
            key={status}
            style={[styles.statusChip, stop.status === status && styles.statusChipActive]}
            onPress={() => onStatusChange(stop, status)}
            disabled={busy || stop.status === status}
            activeOpacity={0.75}
          >
            <Text style={[styles.statusChipText, stop.status === status && styles.statusChipTextActive]}>
              {statusLabels[status]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightGray,
  },
  flex: {
    flex: 1,
  },
  refreshButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  reminderCard: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${Colors.primary}18`,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  reminderTextContainer: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  reminderSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
  },
  reminderMinuteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  reminderMinuteChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reminderMinuteChipActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}12`,
  },
  reminderMinuteText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.gray,
  },
  reminderMinuteTextActive: {
    color: Colors.primary,
  },
  automationOverviewCard: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${Colors.primary}24`,
  },
  automationOverviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  automationIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: `${Colors.primary}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.lightGray,
    marginTop: 14,
    paddingTop: 14,
  },
  confirmationTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  confirmationSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.gray,
    marginTop: 2,
  },
  formCard: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  formTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  formTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  label: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.gray,
    marginBottom: 8,
  },
  locationChipSection: {
    marginBottom: 10,
  },
  locationChipSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationChipSectionLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.gray,
    marginBottom: 6,
  },
  clearAllRecentsText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.primary,
    marginBottom: 6,
  },
  locationChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  locationChip: {
    backgroundColor: Colors.lightGray,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: 220,
  },
  savedLocationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationChipSelectArea: {
    flexShrink: 1,
  },
  locationChipEditButton: {
    marginLeft: 2,
  },
  locationChipText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark,
  },
  input: {
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: Colors.dark,
    marginBottom: 14,
  },
  noteInput: {
    minHeight: 82,
  },
  locationHelperText: {
    fontSize: 12,
    color: Colors.gray,
    marginTop: -8,
    marginBottom: 14,
  },
  newStopAutomationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  newStopAutomationTextGroup: {
    flex: 1,
  },
  newStopAutomationLabel: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 2,
  },
  newStopAutomationDetail: {
    fontSize: 12,
    color: Colors.gray,
  },
  timeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  timeInputGroup: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 180,
    minWidth: 0,
  },
  pickerButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  pickerButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  selectedDatesCard: {
    backgroundColor: `${Colors.primary}08`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}18`,
    padding: 12,
    marginBottom: 16,
  },
  selectedDatesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  selectedDatesTitle: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.dark,
  },
  selectedDatesSubtitle: {
    fontSize: 12,
    color: Colors.gray,
    marginTop: 3,
  },
  selectedDatesHelper: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.gray,
    marginTop: 5,
  },
  selectedDateList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedDateChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: Colors.light,
    borderWidth: 1,
    borderColor: `${Colors.primary}25`,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 5,
  },
  selectedDateText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  removeDateButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: Colors.lightGray,
  },
  removeDateButtonText: {
    color: Colors.gray,
    fontSize: 13,
    fontWeight: '900' as const,
    lineHeight: 16,
  },
  noSelectedDatesText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  periodSegmentedControl: {
    minHeight: 46,
    flexDirection: 'row',
    backgroundColor: Colors.lightGray,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 3,
    marginBottom: 14,
  },
  periodSegment: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  periodSegmentSelected: {
    backgroundColor: Colors.primary,
  },
  periodSegmentText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.gray,
    includeFontPadding: false,
  },
  periodSegmentTextSelected: {
    color: Colors.light,
    fontWeight: '900' as const,
  },
  timeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.primary}10`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  timeSummaryItem: {
    flex: 1,
  },
  timeSummaryLabel: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: Colors.gray,
    textTransform: 'uppercase' as const,
    marginBottom: 3,
  },
  timeSummaryValue: {
    fontSize: 17,
    fontWeight: '900' as const,
    color: Colors.dark,
  },
  timeSummaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: `${Colors.primary}30`,
    marginHorizontal: 14,
  },
  pickerContainer: {
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  pickerDoneButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pickerDoneText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '800' as const,
  },
  durationSummary: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.dark,
    marginTop: -8,
    marginBottom: 14,
  },
  durationSummaryInvalid: {
    color: Colors.danger,
  },
  overnightControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${Colors.primary}35`,
    backgroundColor: Colors.light,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  overnightControlOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  overnightTextGroup: {
    flex: 1,
  },
  overnightTitle: {
    fontSize: 15,
    fontWeight: '900' as const,
    color: Colors.dark,
    marginBottom: 3,
  },
  overnightTitleOn: {
    color: Colors.light,
  },
  overnightDetail: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
  },
  overnightDetailOn: {
    color: `${Colors.light}DD`,
  },
  overnightValidation: {
    color: Colors.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700' as const,
    marginBottom: 16,
  },
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.light,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  savedLocationModalContainer: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  savedLocationModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  savedLocationModalTitle: {
    fontSize: 19,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  savedLocationModalClose: {
    padding: 4,
  },
  savedLocationModalFlex: {
    flex: 1,
  },
  savedLocationModalContent: {
    flex: 1,
  },
  savedLocationModalContentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  deleteSavedLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.danger,
    gap: 8,
    marginTop: 12,
  },
  deleteSavedLocationButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  cancelEditButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 10,
  },
  cancelEditButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.gray,
  },
  errorMessage: {
    color: Colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  successMessage: {
    color: Colors.success,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    fontWeight: '700' as const,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  listCount: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.gray,
    backgroundColor: Colors.light,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 52,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.gray,
    textAlign: 'center',
  },
  stopCard: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}18`,
  },
  stopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
  },
  reminderBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  reminderBadgeOn: {
    backgroundColor: `${Colors.success}18`,
  },
  reminderBadgeOff: {
    backgroundColor: `${Colors.gray}18`,
  },
  reminderBadgeText: {
    fontSize: 11,
    fontWeight: '800' as const,
  },
  reminderBadgeTextOn: {
    color: Colors.success,
  },
  reminderBadgeTextOff: {
    color: Colors.gray,
  },
  endedText: {
    fontSize: 12,
    color: Colors.gray,
    fontWeight: '700' as const,
  },
  stopHeaderActions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconActionButton: {
    padding: 6,
  },
  stopTime: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 6,
  },
  stopLocation: {
    fontSize: 15,
    lineHeight: 21,
    color: Colors.dark,
    marginBottom: 6,
  },
  locationVerificationCaption: {
    fontSize: 12,
    color: Colors.gray,
    marginBottom: 8,
  },
  controlClarifyingCaption: {
    fontSize: 12,
    color: Colors.gray,
    marginBottom: 8,
  },
  stopNote: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray,
    marginBottom: 12,
  },
  stopAutomationPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}20`,
    backgroundColor: `${Colors.primary}08`,
    padding: 12,
    marginBottom: 14,
  },
  stopAutomationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stopAutomationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopAutomationTitle: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.dark,
  },
  automationStatusLabel: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.gray,
    marginTop: 6,
  },
  automationStatusLabelActive: {
    color: Colors.primary,
  },
  automationStatusDetail: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.gray,
    marginTop: 3,
  },
  goLivePanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}22`,
    backgroundColor: `${Colors.primary}08`,
    padding: 12,
    marginTop: 8,
    marginBottom: 12,
    gap: 10,
  },
  goLiveReadyText: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  goLiveButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  liveNowButton: {
    backgroundColor: `${Colors.success}18`,
    borderWidth: 1,
    borderColor: `${Colors.success}35`,
  },
  goLiveButtonText: {
    fontSize: 16,
    fontWeight: '900' as const,
    color: Colors.light,
  },
  liveNowButtonText: {
    color: Colors.success,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusChipActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}12`,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.gray,
  },
  statusChipTextActive: {
    color: Colors.primary,
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
});
