import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Animated, Modal, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Star } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp, useTruckReviews, useTruckRating } from '@/contexts/AppContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReviewerAvatar from '@/components/ReviewerAvatar';
import ExpandableText from '@/components/ExpandableText';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';
import { Review } from '@/types';

export default function TruckReviewsScreen() {
  const router = useRouter();
  const { getUserTruck, refreshReviews, addReviewReply, updateReviewReply, deleteReviewReply } = useApp();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [replyModalVisible, setReplyModalVisible] = useState<boolean>(false);
  const [replyDraft, setReplyDraft] = useState<string>('');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [isSavingReply, setIsSavingReply] = useState<boolean>(false);
  useTruckLifecycleLogger('TruckReviewsScreen');
  
  const truck = getUserTruck();
  const reviews = useTruckReviews(truck?.id || '');
  const reviewsRef = React.useRef(reviews);
  const selectedReview = selectedReviewId
    ? reviews.find(review => review.id === selectedReviewId) ?? null
    : null;
  const { average, count } = useTruckRating(truck?.id || '');

  React.useEffect(() => {
    reviewsRef.current = reviews;
  }, [reviews]);

  const ratingBreakdown = useMemo(() => {
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(review => {
      breakdown[review.rating as keyof typeof breakdown]++;
    });
    return breakdown;
  }, [reviews]);

  const isRecentReview = (createdAt: string) => {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const hoursSince = (now - created) / (1000 * 60 * 60);
  return hoursSince <= 12;
};

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshReviews();
    } finally {
      setRefreshing(false);
    }
  };

  const openReplyModal = (review: Review) => {
    setSelectedReviewId(review.id);
    setReplyDraft(review.ownerReply?.body ?? '');
    setReplyModalVisible(true);
  };

  const closeReplyModal = () => {
    setReplyModalVisible(false);
    setSelectedReviewId(null);
    setReplyDraft('');
    setIsSavingReply(false);
  };

  const handleSaveReply = async () => {
    if (!selectedReviewId || !truck) return;

    const body = replyDraft.trim();
    if (!body) {
      Alert.alert('Reply required', 'Please enter a response before saving.');
      return;
    }

    try {
      setIsSavingReply(true);
      const latestReview = reviewsRef.current.find(review => review.id === selectedReviewId);
      if (!latestReview) {
        throw new Error('Review is no longer available. Refresh and try again.');
      }

      if (latestReview.ownerReply) {
        await updateReviewReply(latestReview.ownerReply.id, body);
      } else {
        await addReviewReply(latestReview.id, truck.id, body);
      }
      closeReplyModal();
    } catch (error: any) {
      Alert.alert('Reply not saved', error?.message ?? 'Could not save your reply.');
      setIsSavingReply(false);
    }
  };

  const handleDeleteReply = (review: Review) => {
    if (!review.ownerReply) return;

    Alert.alert(
      'Delete reply?',
      'This response will be removed from the public review.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const latestReview = reviewsRef.current.find(item => item.id === review.id);
              if (!latestReview?.ownerReply) {
                throw new Error('Reply is no longer available. Refresh and try again.');
              }
              await deleteReviewReply(latestReview.ownerReply.id);
            } catch (error: any) {
              Alert.alert('Reply not deleted', error?.message ?? 'Could not delete your reply.');
            }
          },
        },
      ],
    );
  };

  if (!truck) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>Truck not found</Text>
      </SafeAreaView>
    );
  }

  const formatTimestamp = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const renderStars = (rating: number, size: number = 16) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={size}
            color={star <= rating ? Colors.starYellow : Colors.lightGray}
            fill={star <= rating ? Colors.starYellow : 'transparent'}
          />
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color={Colors.dark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reviews</Text>
          <View style={styles.backButton} />
        </View>
      </SafeAreaView>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        <View style={styles.content}>
          <Animated.View style={[styles.summaryCard, { opacity: fadeAnim }]}>
            <View style={styles.summaryLeft}>
              <Text style={styles.averageRating}>{average > 0 ? average.toFixed(1) : '0.0'}</Text>
              {renderStars(average, 20)}
              <Text style={styles.totalReviews}>{count} {count === 1 ? 'review' : 'reviews'}</Text>
            </View>
            
            <View style={styles.summaryRight}>
              {[5, 4, 3, 2, 1].map((rating) => {
                const ratingCount = ratingBreakdown[rating as keyof typeof ratingBreakdown];
                const percentage = count > 0 ? (ratingCount / count) * 100 : 0;
                
                return (
                  <View key={rating} style={styles.ratingRow}>
                    <Text style={styles.ratingLabel}>{rating}</Text>
                    <Star size={14} color={Colors.starYellow} fill={Colors.starYellow} />
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${percentage}%` }]} />
                    </View>
                    <Text style={styles.ratingCount}>{ratingCount}</Text>
                  </View>
                );
              })}
            </View>
          </Animated.View>

          {reviews.length === 0 ? (
            <View style={styles.emptyState}>
              <Star size={48} color={Colors.lightGray} />
              <Text style={styles.emptyTitle}>No Reviews Yet</Text>
              <Text style={styles.emptyText}>
                When customers leave reviews, they&apos;ll appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.reviewsList}>
              <Text style={styles.sectionTitle}>Customer Reviews</Text>
              {reviews.map((review, index) => (
                <Animated.View 
                  key={review.id} 
                  style={[
                    styles.reviewCard,
                    { 
                      opacity: fadeAnim,
                      transform: [{
                        translateY: fadeAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0],
                        })
                      }]
                    }
                  ]}
                >
                  <View style={styles.reviewHeader}>
                    <ReviewerAvatar
  name={review.user.name}
  photo={review.user.profile_photo}
  size={44}
/>
                    <View style={styles.reviewHeaderContent}>
                      <View style={styles.reviewTopRow}>
  <View style={styles.reviewNameRow}>
    <Text style={styles.reviewUserName}>{review.user.name}</Text>

    {isRecentReview(review.createdAt) && (
      <View style={styles.newBadge}>
        <Text style={styles.newBadgeText}>NEW</Text>
      </View>
    )}
  </View>

  <Text style={styles.reviewTime}>
    {formatTimestamp(review.createdAt)}
  </Text>
</View>
                      {renderStars(review.rating, 16)}
                    </View>
                  </View>
                  <ExpandableText text={review.text} numberOfLines={3} style={styles.reviewText} />
                  {review.ownerReply ? (
                    <View style={styles.ownerReplyCard}>
                      <Text style={styles.ownerReplyLabel}>Your response</Text>
                      <ExpandableText
                        text={review.ownerReply.body}
                        numberOfLines={3}
                        style={styles.ownerReplyText}
                      />
                      <View style={styles.replyActions}>
                        <TouchableOpacity
                          style={styles.editReplyButton}
                          onPress={() => openReplyModal(review)}
                        >
                          <Text style={styles.editReplyButtonText}>Edit Reply</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteReplyButton}
                          onPress={() => handleDeleteReply(review)}
                        >
                          <Text style={styles.deleteReplyButtonText}>Delete Reply</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.replyButton}
                      onPress={() => openReplyModal(review)}
                    >
                      <Text style={styles.replyButtonText}>Reply</Text>
                    </TouchableOpacity>
                  )}
                  {index < reviews.length - 1 && <View style={styles.separator} />}
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={replyModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeReplyModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.replyModal}>
            <Text style={styles.replyModalTitle}>
              {selectedReview?.ownerReply ? 'Edit Reply' : 'Reply to Review'}
            </Text>
            <TextInput
              style={styles.replyInput}
              value={replyDraft}
              onChangeText={setReplyDraft}
              placeholder="Write a public response..."
              placeholderTextColor={Colors.gray}
              multiline
              textAlignVertical="top"
              maxLength={1000}
            />
            <View style={styles.replyModalActions}>
              <TouchableOpacity
                style={styles.cancelReplyButton}
                onPress={closeReplyModal}
                disabled={isSavingReply}
              >
                <Text style={styles.cancelReplyButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveReplyButton, isSavingReply && styles.saveReplyButtonDisabled]}
                onPress={handleSaveReply}
                disabled={isSavingReply}
              >
                <Text style={styles.saveReplyButtonText}>
                  {isSavingReply ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  safeArea: {
    backgroundColor: Colors.light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.dark,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  summaryCard: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    flexDirection: 'row',
    gap: 24,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryLeft: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 24,
    borderRightWidth: 1,
    borderRightColor: Colors.lightGray,
  },
  summaryRight: {
    flex: 1,
    gap: 8,
  },
  averageRating: {
    fontSize: 48,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  totalReviews: {
    fontSize: 14,
    color: Colors.gray,
    marginTop: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark,
    width: 12,
  },
  reviewNameRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},

newBadge: {
  backgroundColor: 'rgba(255, 140, 0, 0.14)',
  borderWidth: 1,
  borderColor: 'rgba(255, 140, 0, 0.35)',
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: 999,
},

newBadgeText: {
  color: '#FF8C00',
  fontSize: 10,
  fontWeight: '700' as const,
  letterSpacing: 0.5,
},
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.lightGray,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.starYellow,
  },
  ratingCount: {
    fontSize: 13,
    color: Colors.gray,
    width: 24,
    textAlign: 'right',
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.gray,
    textAlign: 'center',
    lineHeight: 22,
  },
  reviewsList: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 20,
    letterSpacing: 0.3,
  },
  reviewCard: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  reviewHeaderContent: {
    flex: 1,
    gap: 6,
  },
  reviewTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewUserName: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  reviewTime: {
    fontSize: 13,
    color: Colors.gray,
    fontWeight: '500' as const,
  },
  reviewText: {
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 22,
  },
  ownerReplyCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  ownerReplyLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  ownerReplyText: {
    fontSize: 14,
    color: Colors.dark,
    lineHeight: 20,
  },
  replyActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  replyButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  replyButtonText: {
    color: Colors.light,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  editReplyButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  editReplyButtonText: {
    color: Colors.light,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  deleteReplyButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  deleteReplyButtonText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  replyModal: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    backgroundColor: Colors.light,
    padding: 20,
  },
  replyModalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 14,
  },
  replyInput: {
    minHeight: 140,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 21,
    backgroundColor: '#FFFFFF',
  },
  replyModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  cancelReplyButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  cancelReplyButtonText: {
    color: Colors.dark,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  saveReplyButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  saveReplyButtonDisabled: {
    opacity: 0.65,
  },
  saveReplyButtonText: {
    color: Colors.light,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.lightGray,
    marginVertical: 12,
    marginTop: 16,
  },
});
