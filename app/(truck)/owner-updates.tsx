import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bell, AlertCircle, Info, ShieldAlert, Wrench, Send, Plus, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/contexts/AppContext';
import { OwnerMessage, OwnerMessageType } from '@/types';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';
import { useTheme } from '@/contexts/ThemeContext';

const MESSAGE_TYPES: OwnerMessageType[] = ['general', 'important', 'maintenance', 'urgent'];

const TYPE_META: Record<OwnerMessageType, { label: string; icon: React.ComponentType<any>; color: string }> = {
  general: { label: 'General', icon: Info, color: '#3B82F6' },
  important: { label: 'Important', icon: AlertCircle, color: '#F59E0B' },
  maintenance: { label: 'Maintenance', icon: Wrench, color: '#8B5CF6' },
  urgent: { label: 'Urgent', icon: ShieldAlert, color: '#EF4444' },
};

export default function OwnerUpdatesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    currentUser,
    getTeamUpdates,
    markOwnerUpdatesViewed,
    createOwnerMessage,
    refreshOwnerMessages,
  } = useApp();
  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<OwnerMessageType>('general');
  const [isSending, setIsSending] = useState(false);
  const isAdmin = currentUser?.role === 'admin';
  useTruckLifecycleLogger('MessageCenter');

  useEffect(() => {
    void refreshOwnerMessages();
  }, [refreshOwnerMessages]);

  const messages = getTeamUpdates();
  const unreadCount = messages.filter(message => !message.read_at).length;

  useEffect(() => {
    if (messages.length > 0) {
      void markOwnerUpdatesViewed();
    }
  }, [markOwnerUpdatesViewed, messages.length]);

  const resetComposer = () => {
    setTitle('');
    setBody('');
    setType('general');
  };

  const handleSend = async () => {
    try {
      setIsSending(true);
      await createOwnerMessage({ title, body, type });
      resetComposer();
      setShowComposer(false);
      Alert.alert('Message sent', 'Truck owners will see this in Message Center.');
    } catch (error: any) {
      Alert.alert('Could not send', error?.message || 'Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Message Center</Text>
            {unreadCount > 0 && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.subtitle}>Important notes from TruckTap for truck owners</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {isAdmin && (
          <View style={styles.adminPanel}>
            <TouchableOpacity
              style={styles.adminToggle}
              onPress={() => setShowComposer(prev => !prev)}
              activeOpacity={0.8}
            >
              {showComposer ? <X size={18} color={colors.primary} /> : <Plus size={18} color={colors.primary} />}
              <Text style={styles.adminToggleText}>{showComposer ? 'Close Sender' : 'Send Message'}</Text>
            </TouchableOpacity>

            {showComposer && (
              <View style={styles.composer}>
                <Text style={styles.composerLabel}>Priority</Text>
                <View style={styles.typeRow}>
                  {MESSAGE_TYPES.map((option) => {
                    const meta = TYPE_META[option];
                    const selected = type === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[
                          styles.typeChip,
                          selected && { borderColor: meta.color, backgroundColor: `${meta.color}18` },
                        ]}
                        onPress={() => setType(option)}
                      >
                        <Text style={[styles.typeChipText, selected && { color: meta.color }]}>
                          {meta.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Message title"
                  placeholderTextColor={colors.secondaryText}
                  maxLength={100}
                />
                <TextInput
                  style={[styles.input, styles.bodyInput]}
                  value={body}
                  onChangeText={setBody}
                  placeholder="Write the message for truck owners..."
                  placeholderTextColor={colors.secondaryText}
                  multiline
                  textAlignVertical="top"
                  maxLength={1200}
                />
                <TouchableOpacity
                  style={[styles.sendButton, isSending && styles.disabledButton]}
                  onPress={handleSend}
                  disabled={isSending}
                >
                  {isSending ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <>
                      <Send size={17} color={colors.background} />
                      <Text style={styles.sendButtonText}>Send to All Truck Owners</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {messages.length > 0 ? (
          messages.map((message) => (
            <MessageCard key={message.id} message={message} styles={styles} />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Bell size={56} color={colors.secondaryText} />
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptySubtitle}>
              TruckTap messages, maintenance notices, and important owner updates will appear here.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MessageCard({ message, styles }: { message: OwnerMessage; styles: ReturnType<typeof createStyles> }) {
  const meta = TYPE_META[message.type];
  const Icon = meta.icon;
  const unread = !message.read_at;

  return (
    <View style={[styles.messageCard, unread && styles.unreadCard, message.type === 'urgent' && styles.urgentCard]}>
      <View style={styles.messageHeader}>
        <View style={[styles.messageIcon, { backgroundColor: `${meta.color}18` }]}>
          <Icon size={18} color={meta.color} />
        </View>
        <View style={styles.messageHeaderText}>
          <View style={styles.messageTitleRow}>
            <Text style={styles.messageTitle}>{message.title}</Text>
            {unread && <View style={styles.smallUnreadDot} />}
          </View>
          <Text style={styles.messageDate}>{formatDate(message.created_at)}</Text>
        </View>
      </View>
      <Text style={styles.messageBody}>{message.body}</Text>
      <View style={[styles.messageTypeBadge, { borderColor: meta.color }]}>
        <Text style={[styles.messageTypeText, { color: meta.color }]}>{meta.label}</Text>
      </View>
    </View>
  );
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  titleContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.secondaryText,
    marginTop: 2,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  adminPanel: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  adminToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adminToggleText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.primary,
  },
  composer: {
    marginTop: 14,
    gap: 10,
  },
  composerLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: colors.secondaryText,
    textTransform: 'uppercase',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.secondaryBackground,
  },
  typeChipText: {
    color: colors.secondaryText,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: colors.text,
    backgroundColor: colors.secondaryBackground,
    fontSize: 15,
  },
  bodyInput: {
    minHeight: 120,
    lineHeight: 21,
  },
  sendButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  disabledButton: {
    opacity: 0.65,
  },
  sendButtonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '800' as const,
  },
  messageCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unreadCard: {
    borderColor: colors.error,
  },
  urgentCard: {
    borderWidth: 2,
  },
  messageHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  messageIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageHeaderText: {
    flex: 1,
  },
  messageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800' as const,
  },
  smallUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  messageDate: {
    color: colors.secondaryText,
    fontSize: 12,
    marginTop: 3,
    fontWeight: '600' as const,
  },
  messageBody: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  messageTypeBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  messageTypeText: {
    fontSize: 12,
    fontWeight: '800' as const,
    textTransform: 'uppercase',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.secondaryText,
    textAlign: 'center',
    lineHeight: 22,
  },
});
