import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Bell, ChevronDown, ChevronUp, Settings, Zap } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { HandsFreeLiveOwnerSettings } from '@/lib/handsFreeLive';
import { FoodTruck } from '@/types';

const REMINDER_MINUTE_OPTIONS = [15, 30, 60] as const;

type ReminderSettings = {
  enabled: boolean;
  minutesBefore: number;
};

export type SchedulerSettingsSectionProps = {
  reminderSettings: ReminderSettings;
  reminderSettingsLoaded: boolean;
  onReminderToggle: (enabled: boolean) => void;
  onReminderMinutesChange: (minutes: number) => void;
  automationSettings: HandsFreeLiveOwnerSettings;
  automationLoading: boolean;
  confirmationPreferenceSaving: boolean;
  onConfirmationPreferenceChange: (enabled: boolean) => void;
  truck: FoodTruck;
  truckDefaultSaving: boolean;
  onTruckDefaultChange: (enabled: boolean) => void;
};

// Module-level, not component state: satisfies "remembered during the current
// session" without a new AsyncStorage key - the toggle survives this screen
// remounting while the app is open, and simply resets on next app launch,
// matching how the rest of this screen treats non-durable UI state.
let rememberedExpanded = false;

export default function SchedulerSettingsSection({
  reminderSettings,
  reminderSettingsLoaded,
  onReminderToggle,
  onReminderMinutesChange,
  automationSettings,
  automationLoading,
  confirmationPreferenceSaving,
  onConfirmationPreferenceChange,
  truck,
  truckDefaultSaving,
  onTruckDefaultChange,
}: SchedulerSettingsSectionProps) {
  const [expanded, setExpandedState] = useState(rememberedExpanded);
  const setExpanded = (next: boolean) => {
    rememberedExpanded = next;
    setExpandedState(next);
  };

  const reminderSummary = reminderSettings.enabled
    ? `On (${reminderSettings.minutesBefore} min before)`
    : 'Off';
  const automationSummary = !automationSettings.supported
    ? 'Unavailable'
    : !automationSettings.systemEnabled
      ? 'Paused'
      : truck.hands_free_live_default_enabled
        ? 'On by default'
        : 'Off by default';

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide scheduler settings' : 'Show scheduler settings'}
        accessibilityState={{ expanded }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={styles.headerIcon}>
          <Settings size={18} color={Colors.primary} />
        </View>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Scheduler Settings</Text>
          {!expanded ? (
            <Text style={styles.summary} numberOfLines={1}>
              Reminders: {reminderSummary} · Hands-Free LIVE: {automationSummary}
            </Text>
          ) : null}
        </View>
        {expanded ? (
          <ChevronUp size={20} color={Colors.gray} />
        ) : (
          <ChevronDown size={20} color={Colors.gray} />
        )}
      </TouchableOpacity>

      {expanded ? (
        <>
          <View style={styles.divider}>
            <View style={styles.reminderHeader}>
              <View style={styles.reminderTextContainer}>
                <Text style={styles.sectionTitle}>Remind me before upcoming stops</Text>
                <Text style={styles.sectionSubtitle}>
                  Reminder: {reminderSettings.minutesBefore} minutes before
                </Text>
              </View>
              <Switch
                value={reminderSettings.enabled}
                onValueChange={onReminderToggle}
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
                  onPress={() => onReminderMinutesChange(minutes)}
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
            <View style={styles.divider}>
              <View style={styles.automationHeader}>
                <View style={styles.automationIcon}>
                  <Zap size={20} color={Colors.primary} />
                </View>
                <View style={styles.reminderTextContainer}>
                  <Text style={styles.sectionTitle}>Hands-Free LIVE</Text>
                  <Text style={styles.sectionSubtitle}>
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
                  onValueChange={onConfirmationPreferenceChange}
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
                  onValueChange={onTruckDefaultChange}
                  disabled={truckDefaultSaving || !automationSettings.systemEnabled}
                  trackColor={{ false: Colors.lightGray, true: `${Colors.primary}55` }}
                  thumbColor={truck.hands_free_live_default_enabled ? Colors.primary : Colors.gray}
                />
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${Colors.primary}18`,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${Colors.primary}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.dark,
  },
  summary: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.gray,
    marginTop: 2,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: Colors.lightGray,
    marginTop: 14,
    paddingTop: 14,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  reminderTextContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  sectionSubtitle: {
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
  automationHeader: {
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
});
