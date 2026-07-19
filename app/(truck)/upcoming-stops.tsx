import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, CalendarDays, ChevronDown, Clock, MapPin, RefreshCw, Trash2, Zap } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { UpcomingStop, UpcomingStopStatus } from '@/types';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';
import {
  configureUpcomingStopAutomation,
  HandsFreeLiveOwnerSettings,
  loadHandsFreeLiveOwnerState,
  setHandsFreeLiveConfirmationNotifications,
  UpcomingStopAutomationStatus,
} from '@/lib/handsFreeLive';

const STATUSES: UpcomingStopStatus[] = ['scheduled', 'delayed', 'cancelled', 'sold_out', 'completed'];
const REMINDER_SETTINGS_KEY = 'upcomingStopReminderSettings';
const REMINDER_IDS_KEY = 'upcomingStopReminderIds';
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

const formatGeocodedAddress = (address: Location.LocationGeocodedAddress | undefined) => {
  if (!address) return null;

  const street = [address.streetNumber, address.street]
    .filter(Boolean)
    .join(' ');
  const cityLine = [address.city, address.region, address.postalCode]
    .filter(Boolean)
    .join(', ');
  return [address.name, street, cityLine]
    .filter((part, index, values) => part && values.indexOf(part) === index)
    .join('\n');
};

const confirmAutomationLocation = (locationLabel: string, resolvedAddress: string | null) =>
  new Promise<boolean>(resolve => {
    Alert.alert(
      'Confirm automatic LIVE location',
      resolvedAddress
        ? `${locationLabel} was located as:\n\n${resolvedAddress}\n\nUse this location?`
        : `Use the mapped coordinates found for ${locationLabel}?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Use Location', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
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
    upcomingStopsLoading,
  } = useApp();
  const truck = getUserTruck();
  useTruckLifecycleLogger('UpcomingStopsScreen');

  const [dateValue, setDateValue] = useState(() => new Date());
  const [selectedDates, setSelectedDates] = useState<Date[]>(() => [startOfSelectedDate(new Date())]);
  const [startTime, setStartTime] = useState(() => atTime(11, 0));
  const [endTime, setEndTime] = useState(() => atTime(14, 0));
  const [endsNextDay, setEndsNextDay] = useState(false);
  const [locationText, setLocationText] = useState('');
  const [note, setNote] = useState('');
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
  const [reminderSettingsLoaded, setReminderSettingsLoaded] = useState(false);
  const [automationSettings, setAutomationSettings] = useState<HandsFreeLiveOwnerSettings>(
    DEFAULT_AUTOMATION_SETTINGS
  );
  const [automationStatuses, setAutomationStatuses] = useState<
    Record<string, UpcomingStopAutomationStatus>
  >({});
  const [automationLoading, setAutomationLoading] = useState(false);
  const [confirmationPreferenceSaving, setConfirmationPreferenceSaving] = useState(false);
  const reminderSettingsRef = useRef(reminderSettings);
  const reminderIdsRef = useRef(reminderIds);

  const stops = useMemo(
    () => truck ? getUpcomingStops(truck.id) : [],
    [getUpcomingStops, truck]
  );

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
    }, 60000);

    return () => clearInterval(intervalId);
  }, [refreshAutomationState]);

  React.useEffect(() => {
    void refreshAutomationState();
  }, [refreshAutomationState]);

  React.useEffect(() => {
    const loadReminderState = async () => {
      try {
        const [storedSettings, storedIds] = await Promise.all([
          AsyncStorage.getItem(REMINDER_SETTINGS_KEY),
          AsyncStorage.getItem(REMINDER_IDS_KEY),
        ]);

        if (storedSettings) {
          const parsed = JSON.parse(storedSettings);
          const nextSettings = normalizeReminderSettings(parsed);
          reminderSettingsRef.current = nextSettings;
          setReminderSettings(nextSettings);
        }

        if (storedIds) {
          const parsedIds = JSON.parse(storedIds);
          if (parsedIds && typeof parsedIds === 'object') {
            reminderIdsRef.current = parsedIds;
            setReminderIds(parsedIds);
          }
        }

      } catch (error) {
        console.log('[UpcomingStops] Failed to load reminder settings:', error);
      } finally {
        setReminderSettingsLoaded(true);
      }
    };

    void loadReminderState();
  }, []);

  const persistReminderSettings = async (settings: ReminderSettings) => {
    const normalizedSettings = normalizeReminderSettings(settings);
    reminderSettingsRef.current = normalizedSettings;
    await AsyncStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(normalizedSettings));
    setReminderSettings(normalizedSettings);
  };

  const persistReminderIds = async (ids: ReminderIds) => {
    reminderIdsRef.current = ids;
    await AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(ids));
    setReminderIds(ids);
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
    const storedNotificationId = reminderIds[stop.id];
    const reminderAt = getUpcomingStopReminderTime(stop, reminderSettings.minutesBefore);
    const now = new Date();
    const reminderOn = !!(
      reminderSettings.enabled &&
      storedNotificationId &&
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

  const handleAutomationToggle = async (stop: UpcomingStop, enabled: boolean) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyStopId(stop.id);

    try {
      if (enabled) {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!timezone) {
          throw new Error('Your device timezone is unavailable. Check date and time settings.');
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

        const matches = await Location.geocodeAsync(stop.location_text);
        const match = matches.find(
          candidate =>
            Number.isFinite(candidate.latitude) &&
            Number.isFinite(candidate.longitude)
        );

        if (!match) {
          throw new Error(
            'TruckTap could not locate this stop. Use a complete street address before turning on Hands-Free LIVE.'
          );
        }

        const reverseMatches = await Location.reverseGeocodeAsync({
          latitude: match.latitude,
          longitude: match.longitude,
        }).catch(() => []);
        const confirmed = await confirmAutomationLocation(
          stop.location_text,
          formatGeocodedAddress(reverseMatches[0])
        );
        if (!confirmed) return;

        await configureUpcomingStopAutomation({
          stopId: stop.id,
          enabled: true,
          latitude: match.latitude,
          longitude: match.longitude,
          timezone,
        });
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
    setDateValue(nextDate);
    setSelectedDates([startOfSelectedDate(nextDate)]);
    setStartTime(atTime(11, 0));
    setEndTime(atTime(14, 0));
    setEndsNextDay(false);
    setLocationText('');
    setNote('');
    setActivePicker(null);
  };

  const buildDateRange = (selectedDate: Date) => {
    const startsAt = combineDateAndTime(selectedDate, startTime);
    const endsAt = combineDateAndTime(selectedDate, endTime);

    if (endsNextDay) {
      endsAt.setDate(endsAt.getDate() + 1);
    }

    if (endsAt <= startsAt) {
      throw new Error('End time must be after start time. Turn on "Ends next day" for overnight stops.');
    }

    return { startsAt, endsAt };
  };

  const addSelectedDate = (date: Date) => {
    setSelectedDates(current => {
      const dateToAdd = startOfSelectedDate(date);
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

  const handleSave = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

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

      const dateRanges = selectedDates.map(selectedDate => buildDateRange(selectedDate));
      const currentSettings = reminderSettingsRef.current;

      setIsSaving(true);

      const createdStops: UpcomingStop[] = [];

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

        if (currentSettings.enabled) {
          await scheduleReminderForStop(createdStop, reminderIdsRef.current, currentSettings);
        }
      }

      if (createdStops.length > 1) {
        setSuccessMessage(`${createdStops.length} stops scheduled.`);
      } else {
        setSuccessMessage('Stop scheduled.');
      }

      resetForm();
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

  const handleRefresh = async () => {
    setErrorMessage(null);

    try {
      await Promise.all([
        refreshUpcomingStops(),
        refreshAutomationState(),
      ]);
    } catch (error: any) {
      setErrorMessage(error?.message ?? 'Could not refresh upcoming stops.');
    }
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
            </View>
          ) : null}

          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.formTitleRow}>
                <CalendarDays size={24} color={Colors.primary} />
                <Text style={styles.formTitle}>Add planned stop</Text>
              </View>
              <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton} disabled={upcomingStopsLoading}>
                {upcomingStopsLoading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <RefreshCw size={20} color={Colors.primary} />
                )}
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
                  <Text style={styles.selectedDatesSubtitle}>Tap a date above to add it.</Text>
                  <Text style={styles.selectedDatesHelper}>
                    Select multiple dates to create stops with the same location and hours.
                  </Text>
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
                <Text style={styles.noSelectedDatesText}>No dates selected</Text>
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
                <Text style={styles.timeSummaryLabel}>End</Text>
                <Text style={styles.timeSummaryValue}>{formatTimeButton(endTime)}</Text>
              </View>
            </View>

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

            <TouchableOpacity
              style={[styles.nextDayToggle, endsNextDay && styles.nextDayToggleOn]}
              onPress={() => setEndsNextDay(value => !value)}
              activeOpacity={0.75}
            >
              <Clock size={18} color={endsNextDay ? Colors.light : Colors.primary} />
              <Text style={[styles.nextDayText, endsNextDay && styles.nextDayTextOn]}>
                Ends next day
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>Location name or address</Text>
            <TextInput
              style={styles.input}
              value={locationText}
              onChangeText={setLocationText}
              placeholder="Downtown farmers market"
              placeholderTextColor={Colors.gray}
              autoCapitalize="words"
            />

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

            {errorMessage ? (
              <Text style={styles.errorMessage}>{errorMessage}</Text>
            ) : null}
            {successMessage ? (
              <Text style={styles.successMessage}>{successMessage}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.saveButton, (isSaving || !reminderSettingsLoaded) && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={isSaving || !reminderSettingsLoaded}
              activeOpacity={0.75}
            >
              {isSaving ? (
                <ActivityIndicator color={Colors.light} />
              ) : (
                <Text style={styles.saveButtonText}>Save Stop</Text>
              )}
            </TouchableOpacity>
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
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onGoLive={handleGoLiveFromStop}
                onAutomationToggle={handleAutomationToggle}
              />
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  onStatusChange: (stop: UpcomingStop, status: UpcomingStopStatus) => void;
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
  onStatusChange,
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
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => onDelete(stop)}
          disabled={busy}
          activeOpacity={0.75}
        >
          {busy ? <ActivityIndicator size="small" color={Colors.gray} /> : <Trash2 size={18} color={Colors.danger} />}
        </TouchableOpacity>
      </View>

      <Text style={styles.stopTime}>{formatDateTime(stop.starts_at)} - {formatDateTime(stop.ends_at)}</Text>
      <Text style={styles.stopLocation}>{stop.location_text}</Text>
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
    color: Colors.gray,
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
  nextDayToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: `${Colors.primary}35`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  nextDayToggleOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  nextDayText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  nextDayTextOn: {
    color: Colors.light,
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
  deleteButton: {
    marginLeft: 'auto',
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
