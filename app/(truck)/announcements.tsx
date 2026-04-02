import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Animated, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Megaphone, Trash2, Send } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';

const MAX_MESSAGE_LENGTH = 200;

export default function AnnouncementsScreen() {
  const router = useRouter();
  const { getUserTruck, getAnnouncements, addAnnouncement, deleteAnnouncement } = useApp();
  const truck = getUserTruck();
  
  const [message, setMessage] = useState<string>('');
  const scrollViewRef = useRef<ScrollView>(null);
  
  if (!truck) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Truck not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const announcements = getAnnouncements(truck.id);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const handlePost = () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter a message');
      return;
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      Alert.alert('Error', `Message must be ${MAX_MESSAGE_LENGTH} characters or less`);
      return;
    }

    addAnnouncement(truck.id, message.trim());
    setMessage('');
    
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }, 100);
  };

  const handleDelete = (announcementId: string) => {
    Alert.alert(
      'Delete Announcement',
      'Are you sure you want to delete this announcement?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteAnnouncement(announcementId),
        },
      ]
    );
  };

  const remainingChars = MAX_MESSAGE_LENGTH - message.length;
  const isValid = message.trim().length > 0 && message.length <= MAX_MESSAGE_LENGTH;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={Colors.dark} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Announcements</Text>
          <Text style={styles.subtitle}>Share updates with customers</Text>
        </View>
      </View>

      <ScrollView 
        ref={scrollViewRef}
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.postCard}>
          <View style={styles.postHeader}>
            <Megaphone size={24} color={Colors.primary} />
            <Text style={styles.postTitle}>New Announcement</Text>
          </View>
          
          <TextInput
            style={styles.input}
            placeholder="What's new with your truck?"
            placeholderTextColor={Colors.lightGray}
            multiline
            numberOfLines={4}
            maxLength={MAX_MESSAGE_LENGTH}
            value={message}
            onChangeText={setMessage}
            textAlignVertical="top"
          />
          
          <View style={styles.postFooter}>
            <Text style={[styles.charCount, remainingChars < 20 && styles.charCountWarning]}>
              {remainingChars} characters left
            </Text>
            <TouchableOpacity 
              style={[styles.postButton, !isValid && styles.postButtonDisabled]}
              onPress={handlePost}
              disabled={!isValid}
              activeOpacity={0.7}
            >
              <Send size={18} color={Colors.light} />
              <Text style={styles.postButtonText}>Post</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Your Announcements</Text>
          <Text style={styles.listCount}>{announcements.length}</Text>
        </View>

        {announcements.length === 0 ? (
          <View style={styles.emptyState}>
            <Megaphone size={64} color={Colors.lightGray} />
            <Text style={styles.emptyTitle}>No announcements yet</Text>
            <Text style={styles.emptySubtitle}>
              Share updates about menu changes, location, hours, or special promotions
            </Text>
          </View>
        ) : (
          announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              message={announcement.message}
              timestamp={announcement.timestamp}
              onDelete={() => handleDelete(announcement.id)}
              formatTimestamp={formatTimestamp}
            />
          ))
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type AnnouncementCardProps = {
  message: string;
  timestamp: string;
  onDelete: () => void;
  formatTimestamp: (timestamp: string) => string;
};

function AnnouncementCard({ message, timestamp, onDelete, formatTimestamp }: AnnouncementCardProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  return (
    <Animated.View style={[styles.announcementCard, { opacity: fadeAnim }]}>
      <View style={styles.announcementHeader}>
        <View style={styles.announcementIconContainer}>
          <Megaphone size={18} color={Colors.primary} />
        </View>
        <Text style={styles.announcementTime}>{formatTimestamp(timestamp)}</Text>
        <TouchableOpacity onPress={onDelete} style={styles.deleteButton} activeOpacity={0.7}>
          <Trash2 size={20} color={Colors.danger} />
        </TouchableOpacity>
      </View>
      <Text style={styles.announcementMessage}>{message}</Text>
    </Animated.View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: Colors.gray,
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
    paddingBottom: 100,
  },
  postCard: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  postTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  input: {
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.dark,
    minHeight: 120,
    marginBottom: 12,
  },
  postFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCount: {
    fontSize: 14,
    color: Colors.gray,
  },
  charCountWarning: {
    color: Colors.danger,
    fontWeight: '600' as const,
  },
  postButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  postButtonDisabled: {
    backgroundColor: Colors.lightGray,
    shadowOpacity: 0,
  },
  postButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light,
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
    fontWeight: '600' as const,
    color: Colors.gray,
    backgroundColor: Colors.lightGray,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
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
  announcementCard: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}20`,
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  announcementIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementTime: {
    flex: 1,
    fontSize: 14,
    color: Colors.gray,
    fontWeight: '500' as const,
  },
  deleteButton: {
    padding: 4,
  },
  announcementMessage: {
    fontSize: 16,
    color: Colors.dark,
    lineHeight: 24,
  },
});
