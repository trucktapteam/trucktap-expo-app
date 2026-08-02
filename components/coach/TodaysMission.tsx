import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle2, Target } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { TruckMission } from '@/lib/truckMission';
import { TruckOpportunityAction } from '@/lib/truckOpportunities';

export type TodaysMissionProps = {
  mission: TruckMission;
  onAction: (action: TruckOpportunityAction) => void;
};

export default function TodaysMission({ mission, onAction }: TodaysMissionProps) {
  const hasCta = mission.action !== 'none' && mission.ctaLabel.length > 0;
  const completed = mission.kind === 'completed';

  return (
    <View style={[styles.card, completed && styles.completedCard]}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, completed && styles.completedIconWrap]}>
          {completed ? (
            <CheckCircle2 size={21} color={Colors.success} />
          ) : (
            <Target size={20} color={Colors.primary} />
          )}
        </View>
        <View style={styles.titleWrap}>
          <Text style={[styles.eyebrow, completed && styles.completedEyebrow]}>
            {completed ? 'Mission Complete' : "Today's Mission"}
          </Text>
          <Text style={styles.title}>{mission.title}</Text>
        </View>
      </View>

      <Text style={styles.why}>{mission.why}</Text>

      {mission.tips && mission.tips.length > 0 ? (
        <View style={styles.tipsList}>
          {mission.tips.map(tip => (
            <View key={tip} style={styles.tipRow}>
              <Text style={styles.tipBullet}>{'•'}</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {hasCta ? (
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => onAction(mission.action)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={mission.ctaLabel}
        >
          <Text style={styles.ctaText}>{mission.ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light,
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  completedCard: {
    borderColor: `${Colors.success}55`,
    backgroundColor: `${Colors.success}08`,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 11,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: `${Colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedIconWrap: {
    backgroundColor: `${Colors.success}16`,
  },
  titleWrap: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: Colors.primary,
    marginBottom: 3,
    textTransform: 'uppercase' as const,
  },
  completedEyebrow: {
    color: Colors.success,
  },
  title: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.dark,
  },
  why: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray,
  },
  tipsList: {
    marginTop: 10,
    gap: 4,
  },
  tipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tipBullet: {
    fontSize: 13,
    color: Colors.primary,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
  },
  ctaButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.light,
  },
});
