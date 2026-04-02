import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bell, AlertCircle, Info } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { TeamUpdate } from '@/types';

export default function OwnerUpdatesScreen() {
  const router = useRouter();
  const { getTeamUpdates, markOwnerUpdatesViewed } = useApp();
  
  useEffect(() => {
    markOwnerUpdatesViewed();
  }, [markOwnerUpdatesViewed]);
  
  const updates = getTeamUpdates();
  const importantUpdates = updates.filter((u: TeamUpdate) => u.important);
  const regularUpdates = updates.filter((u: TeamUpdate) => !u.important);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={Colors.dark} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Owner Updates</Text>
          <Text style={styles.subtitle}>News & tips from TruckTap</Text>
        </View>
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {importantUpdates.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <AlertCircle size={20} color={Colors.danger} />
              <Text style={styles.sectionTitle}>Important</Text>
            </View>
            {importantUpdates.map((update: TeamUpdate) => (
              <UpdateCard
                key={update.id}
                title={update.title}
                body={update.body}
                date={update.date}
                important={update.important}
                formatDate={formatDate}
              />
            ))}
          </>
        )}

        {regularUpdates.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Info size={20} color={Colors.gray} />
              <Text style={styles.sectionTitle}>Recent Updates</Text>
            </View>
            {regularUpdates.map((update: TeamUpdate) => (
              <UpdateCard
                key={update.id}
                title={update.title}
                body={update.body}
                date={update.date}
                important={update.important}
                formatDate={formatDate}
              />
            ))}
          </>
        )}

        {updates.length === 0 && (
          <View style={styles.emptyState}>
            <Bell size={64} color={Colors.lightGray} />
            <Text style={styles.emptyTitle}>No updates yet</Text>
            <Text style={styles.emptySubtitle}>
              Check back here for news, tips, and important announcements from the TruckTap team
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type UpdateCardProps = {
  title: string;
  body: string;
  date: string;
  important: boolean;
  formatDate: (dateString: string) => string;
};

function UpdateCard({ title, body, date, important, formatDate }: UpdateCardProps) {
  return (
    <View style={[styles.updateCard, important && styles.updateCardImportant]}>
      <View style={styles.updateHeader}>
        <Text style={styles.updateTitle}>{title}</Text>
        {important && (
          <View style={styles.importantBadge}>
            <Text style={styles.importantBadgeText}>Important</Text>
          </View>
        )}
      </View>
      <Text style={styles.updateBody}>{body}</Text>
      <Text style={styles.updateDate}>{formatDate(date)}</Text>
    </View>
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
    paddingVertical: 16,
    backgroundColor: Colors.light,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.gray,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  updateCard: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  updateCardImportant: {
    borderWidth: 2,
    borderColor: `${Colors.danger}40`,
    backgroundColor: `${Colors.danger}05`,
  },
  updateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  updateTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
    lineHeight: 24,
  },
  importantBadge: {
    backgroundColor: Colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  importantBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.light,
    textTransform: 'uppercase' as const,
  },
  updateBody: {
    fontSize: 16,
    color: Colors.dark,
    lineHeight: 24,
    marginBottom: 12,
  },
  updateDate: {
    fontSize: 14,
    color: Colors.gray,
    fontWeight: '500' as const,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
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
    color: Colors.gray,
    textAlign: 'center',
    lineHeight: 22,
  },
});
