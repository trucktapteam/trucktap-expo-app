import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert, Platform, Animated, LayoutAnimation, UIManager, ScrollView, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Clock, ChevronLeft, Zap, Trash2, Share2 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { OperatingHours } from '@/types';
import DateTimePicker from '@react-native-community/datetimepicker';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function OperatingHoursScreen() {
  const router = useRouter();
  const { getUserTruck, updateOperatingHours, getOperatingHours, isTruckOpenNow } = useApp();
  const truck = getUserTruck();

  const defaultHours: OperatingHours = DAYS.reduce((acc, day) => {
    acc[day] = { open: '09:00', close: '17:00', closed: false };
    return acc;
  }, {} as OperatingHours);

  const [hours, setHours] = useState<OperatingHours>(defaultHours);
  const [showPicker, setShowPicker] = useState<{
    day: string;
    type: 'open' | 'close';
  } | null>(null);
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [openStatusAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (truck) {
      const existingHours = getOperatingHours(truck.id);
      if (existingHours) {
        setHours(existingHours);
      }
    }
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [truck, getOperatingHours, fadeAnim]);

  useEffect(() => {
    if (truck) {
      const isOpen = isTruckOpenNow(truck.id);
      Animated.timing(openStatusAnim, {
        toValue: isOpen ? 1 : 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  }, [truck, hours, openStatusAnim, isTruckOpenNow]);

  const handleToggleClosed = (day: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHours(prev => ({
      ...prev,
      [day]: { ...prev[day], closed: !prev[day].closed },
    }));
    setHasChanges(true);
  };

  const handleTimeChange = (day: string, type: 'open' | 'close', event: { type: string }, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(null);
    }

    if (event.type === 'dismissed') {
      setShowPicker(null);
      return;
    }

    if (selectedDate) {
      const timeString = `${selectedDate.getHours().toString().padStart(2, '0')}:${selectedDate.getMinutes().toString().padStart(2, '0')}`;
      setHours(prev => ({
        ...prev,
        [day]: { ...prev[day], [type]: timeString },
      }));
      setHasChanges(true);
    }
  };

  const parseTime = (timeString: string): Date => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours);
    date.setMinutes(minutes);
    return date;
  };

  const formatTimeDisplay = (timeString: string): string => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const validateHours = (): boolean => {
    for (const day of DAYS) {
      const dayHours = hours[day];
      if (!dayHours.closed) {
        const [openHour, openMin] = dayHours.open.split(':').map(Number);
        const [closeHour, closeMin] = dayHours.close.split(':').map(Number);
        const openTime = openHour * 60 + openMin;
        const closeTime = closeHour * 60 + closeMin;
        
        if (closeTime <= openTime) {
          Alert.alert(
            'Invalid Hours',
            `${day}: Closing time must be later than opening time.`,
            [{ text: 'OK' }]
          );
          return false;
        }
      }
    }
    return true;
  };

  const handleSave = () => {
    if (!truck) return;
    if (!validateHours()) return;

    updateOperatingHours(truck.id, hours);
    setHasChanges(false);
    Alert.alert('Success', 'Hours updated!', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const handleSetAllWeek = () => {
    const standardHours = { open: '11:00', close: '19:00', closed: false };
    const newHours: OperatingHours = DAYS.reduce((acc, day) => {
      acc[day] = { ...standardHours };
      return acc;
    }, {} as OperatingHours);
    setHours(newHours);
    setHasChanges(true);
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Hours',
      'Mark all days as closed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            const clearedHours: OperatingHours = DAYS.reduce((acc, day) => {
              acc[day] = { open: '09:00', close: '17:00', closed: true };
              return acc;
            }, {} as OperatingHours);
            setHours(clearedHours);
            setHasChanges(true);
          },
        },
      ]
    );
  };

  const handleCopyToAllDays = (sourceDay: string) => {
    Alert.alert(
      'Copy Hours',
      `Copy ${sourceDay}'s hours to all other open days?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Copy',
          onPress: () => {
            const sourceDayHours = hours[sourceDay];
            const newHours: OperatingHours = { ...hours };
            
            DAYS.forEach(day => {
              if (!newHours[day].closed && day !== sourceDay) {
                newHours[day] = { 
                  open: sourceDayHours.open, 
                  close: sourceDayHours.close,
                  closed: false 
                };
              }
            });
            
            setHours(newHours);
            setHasChanges(true);
            Alert.alert('Success', 'Hours copied to all open days!');
          },
        },
      ]
    );
  };

  const getCurrentStatus = () => {
    if (!truck) return null;
    const isOpen = isTruckOpenNow(truck.id);
    return isOpen;
  };

  const renderTimePicker = (day: string, type: 'open' | 'close') => {
    const timeValue = hours[day][type];
    const currentTime = parseTime(timeValue);

    if (Platform.OS === 'ios') {
      return (
        <View style={styles.iosTimePickerContainer}>
          <DateTimePicker
            value={currentTime}
            mode="time"
            display="compact"
            onChange={(event: { type: string }, date?: Date) => handleTimeChange(day, type, event, date)}
            style={styles.iosTimePicker}
          />
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={styles.timeButton}
        onPress={() => setShowPicker({ day, type })}
      >
        <Clock size={16} color={Colors.gray} />
        <Text style={styles.timeButtonText}>{formatTimeDisplay(timeValue)}</Text>
      </TouchableOpacity>
    );
  };

  const statusBackgroundColor = openStatusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.gray, Colors.success],
  });

  const isOpen = getCurrentStatus();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color={Colors.dark} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Operating Hours</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
        <Animated.View style={[styles.mainContent, { opacity: fadeAnim }]}>
          <View style={styles.titleSection}>
            <Text style={styles.mainTitle}>Operating Hours</Text>
            <Text style={styles.subtitle}>Set when your truck is open for customers.</Text>
          </View>

          {truck && (
            <Animated.View style={[styles.statusBanner, { backgroundColor: statusBackgroundColor }]}>
              <Text style={styles.statusBannerText}>
                {isOpen ? '🟢 Currently Open' : '⚫ Currently Closed'}
              </Text>
            </Animated.View>
          )}

          <View style={styles.quickActionsBar}>
            <TouchableOpacity style={styles.quickActionButton} onPress={handleSetAllWeek}>
              <Zap size={16} color={Colors.primary} />
              <Text style={styles.quickActionText}>Set 11–7 All Week</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickActionButton} onPress={handleClearAll}>
              <Trash2 size={16} color={Colors.gray} />
              <Text style={styles.quickActionText}>Clear All</Text>
            </TouchableOpacity>
          </View>

          {DAYS.map((day, index) => {
            const dayHours = hours[day];
            const now = new Date();
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const isToday = dayNames[now.getDay()] === day;

            return (
              <View key={day} style={[styles.dayCard, isToday && styles.todayCard]}>
                <View style={styles.dayHeader}>
                  <View style={styles.dayNameContainer}>
                    <Text style={[styles.dayName, isToday && styles.todayDayName]}>{day}</Text>
                    {isToday && <View style={styles.todayBadge}><Text style={styles.todayBadgeText}>Today</Text></View>}
                  </View>
                  <View style={styles.closedToggle}>
                    <Text style={styles.closedLabel}>Open</Text>
                    <Switch
                      value={!dayHours.closed}
                      onValueChange={() => handleToggleClosed(day)}
                      trackColor={{ false: Colors.lightGray, true: Colors.primary }}
                      thumbColor={Colors.light}
                    />
                  </View>
                </View>

                {!dayHours.closed && (
                  <>
                    <View style={styles.timeRow}>
                      <View style={styles.timeSection}>
                        <Text style={styles.timeLabel}>Opens at</Text>
                        {renderTimePicker(day, 'open')}
                      </View>

                      <Text style={styles.timeSeparator}>—</Text>

                      <View style={styles.timeSection}>
                        <Text style={styles.timeLabel}>Closes at</Text>
                        {renderTimePicker(day, 'close')}
                      </View>
                    </View>

                    <View style={styles.copyButtonsRow}>
                      <TouchableOpacity 
                        style={styles.copyToAllButton}
                        onPress={() => handleCopyToAllDays(day)}
                        activeOpacity={0.7}
                      >
                        <Share2 size={14} color={Colors.primary} />
                        <Text style={styles.copyToAllButtonText}>Copy these hours to all days</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {!dayHours.closed && (() => {
                  const [openHour, openMin] = dayHours.open.split(':').map(Number);
                  const [closeHour, closeMin] = dayHours.close.split(':').map(Number);
                  const openTime = openHour * 60 + openMin;
                  const closeTime = closeHour * 60 + closeMin;
                  if (closeTime <= openTime) {
                    return (
                      <View style={styles.errorBanner}>
                        <Text style={styles.errorBannerText}>⚠️ Closing time must be after opening time</Text>
                      </View>
                    );
                  }
                  return null;
                })()}

              </View>
            );
          })}

        </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.stickyBottomContainer}>
        <TouchableOpacity 
          style={[styles.saveButton, !hasChanges && styles.saveButtonDisabled]} 
          onPress={handleSave}
          disabled={!hasChanges}
          activeOpacity={0.7}
        >
          <Text style={styles.saveButtonText}>Save Hours</Text>
        </TouchableOpacity>
      </View>

      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={parseTime(hours[showPicker.day][showPicker.type])}
          mode="time"
          display="default"
          onChange={(event: { type: string }, date?: Date) => handleTimeChange(showPicker.day, showPicker.type, event, date)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightGray,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.light,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  headerRight: {
    width: 44,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  mainContent: {
    gap: 20,
  },
  titleSection: {
    gap: 4,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.gray,
    lineHeight: 20,
  },
  statusBanner: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statusBannerText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light,
  },
  quickActionsBar: {
    flexDirection: 'row',
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark,
  },
  dayCard: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  todayCard: {
    borderWidth: 2,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.15,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayName: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.dark,
  },
  todayDayName: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  todayBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  todayBadgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.light,
  },
  closedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closedLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.gray,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.lightGray,
  },
  timeSection: {
    flex: 1,
    gap: 8,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  timeSeparator: {
    fontSize: 20,
    color: Colors.gray,
    marginHorizontal: 12,
    fontWeight: '300' as const,
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.lightGray,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    minWidth: 110,
  },
  timeButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark,
  },
  iosTimePickerContainer: {
    backgroundColor: Colors.lightGray,
    borderRadius: 10,
    overflow: 'hidden',
  },
  iosTimePicker: {
    height: 44,
  },
  copyButtonsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  copyToAllButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: `${Colors.primary}08`,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${Colors.primary}20`,
  },
  copyToAllButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  errorBanner: {
    backgroundColor: `${Colors.error}10`,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  errorBannerText: {
    fontSize: 13,
    color: Colors.error,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
  stickyBottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.light,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.lightGray,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    backgroundColor: Colors.lightGray,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.light,
  },
});
