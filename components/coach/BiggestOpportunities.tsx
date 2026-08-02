import React from 'react';
import { StyleSheet, Text, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { TruckOpportunity, TruckOpportunityAction, TruckOpportunityPriority } from '@/lib/truckOpportunities';

export type BiggestOpportunitiesProps = {
  opportunities: TruckOpportunity[];
  onAction: (action: TruckOpportunityAction) => void;
};

const priorityLabels: Record<TruckOpportunityPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const actionLabels: Partial<Record<TruckOpportunityAction, string>> = {
  qrCenter: 'Print QR Code',
  schedule: 'Add stop',
  goLive: 'Go Live',
  announcement: 'Share update',
  checkIns: 'View check-ins',
  menu: 'Add items',
  gallery: 'Add photos',
  reviews: 'Reply',
  profile: 'Edit profile',
};

const priorityPillStyle: Record<TruckOpportunityPriority, [ViewStyle, TextStyle]> = {
  high: [{ backgroundColor: `${Colors.error}14` }, { color: Colors.error }],
  medium: [{ backgroundColor: `${Colors.warning}18` }, { color: Colors.warning }],
  low: [{ backgroundColor: `${Colors.primary}12` }, { color: Colors.primary }],
};

export default function BiggestOpportunities({ opportunities, onAction }: BiggestOpportunitiesProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Biggest Opportunities</Text>
        <Text style={styles.subtitle}>Ranked by what grows your business most.</Text>
      </View>

      {opportunities.length > 0 ? (
        <View style={styles.list}>
          {opportunities.map(opportunity => {
            const actionLabel = actionLabels[opportunity.action];
            const [pillStyle, pillTextStyle] = priorityPillStyle[opportunity.priority];

            return (
              <View key={opportunity.id} style={styles.item}>
                <View style={styles.itemContent}>
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.itemTitle}>{opportunity.title}</Text>
                    <View style={[styles.priorityPill, pillStyle]}>
                      <Text style={[styles.priorityText, pillTextStyle]}>
                        {priorityLabels[opportunity.priority]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.itemDescription}>{opportunity.description}</Text>
                </View>
                {actionLabel ? (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onAction(opportunity.action)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.actionText}>{actionLabel}</Text>
                    <ChevronRight size={15} color={Colors.primary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.emptyText}>You&apos;re all caught up. Check back tomorrow for your next mission.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light,
    padding: 15,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${Colors.primary}18`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    marginBottom: 12,
    gap: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
  },
  list: {
    gap: 10,
  },
  item: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  itemContent: {
    gap: 5,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  itemDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
  },
  priorityPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '800' as const,
  },
  actionButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${Colors.primary}10`,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.gray,
  },
});
