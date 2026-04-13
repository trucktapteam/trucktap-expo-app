import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle, Circle, Award } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function VerificationScreen() {
  const router = useRouter();
  const { getUserTruck, setTruckVerified } = useApp();
  const truck = getUserTruck();

  const requirements = useMemo(() => {
    if (!truck) return [];

    return [
      {
        id: 'logo',
        label: 'Upload logo',
        completed: !!truck.logo && truck.logo !== 'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=200',
      },
      {
        id: 'hero',
        label: 'Upload hero image',
        completed: !!truck.hero_image && truck.hero_image !== 'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=800',
      },
      {
        id: 'phone',
        label: 'Add phone number',
        completed: !!truck.phone && truck.phone.trim() !== '',
      },
      {
        id: 'address',
        label: 'Add address',
        completed: !!(truck.location?.address) && truck.location.address.trim() !== '',
      },
      {
        id: 'cuisine',
        label: 'Add cuisine type',
        completed: !!truck.cuisine_type && truck.cuisine_type !== 'Unspecified',
      },
      {
        id: 'hours',
        label: 'Add operating hours',
        completed: !!truck.operatingHours && Object.keys(truck.operatingHours).length > 0,
      },
    ];
  }, [truck]);

  const allRequirementsMet = useMemo(() => {
    return requirements.every(req => req.completed);
  }, [requirements]);

  const completedCount = useMemo(() => {
    return requirements.filter(req => req.completed).length;
  }, [requirements]);

  const handleSubmit = () => {
    if (!truck) return;

    if (!allRequirementsMet) {
      Alert.alert(
        'Requirements Not Met',
        'Please complete all requirements before submitting for verification.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Submit for Verification?',
      'Your truck will be marked as verified. This helps customers trust your business.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: () => {
            setTruckVerified(truck.id, true);
            Alert.alert(
              'Success!',
              'Your truck has been verified. Customers will now see a verified badge on your profile.',
              [
                {
                  text: 'OK',
                  onPress: () => router.back(),
                },
              ]
            );
          },
        },
      ]
    );
  };

  if (!truck) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No truck found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Award size={48} color={Colors.primary} strokeWidth={2} />
            </View>
            <Text style={styles.title}>Get Verified</Text>
            <Text style={styles.subtitle}>
              Build trust with customers by completing these requirements
            </Text>
          </View>

          {truck.verified && (
            <View style={styles.alreadyVerifiedBanner}>
              <CheckCircle size={24} color={Colors.success} />
              <Text style={styles.alreadyVerifiedText}>Your truck is already verified!</Text>
            </View>
          )}

          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Progress</Text>
            <Text style={styles.progressText}>
              {completedCount} of {requirements.length} requirements completed
            </Text>
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBar,
                  { width: `${(completedCount / requirements.length) * 100}%` },
                ]}
              />
            </View>
          </View>

          <View style={styles.requirementsSection}>
            <Text style={styles.sectionTitle}>Requirements</Text>
            {requirements.map(req => (
              <View key={req.id} style={styles.requirementItem}>
                {req.completed ? (
                  <CheckCircle size={24} color={Colors.success} />
                ) : (
                  <Circle size={24} color={Colors.gray} />
                )}
                <Text
                  style={[
                    styles.requirementText,
                    req.completed && styles.requirementTextCompleted,
                  ]}
                >
                  {req.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.benefitsSection}>
            <Text style={styles.sectionTitle}>Verification Benefits</Text>
            <View style={styles.benefitItem}>
              <CheckCircle size={20} color={Colors.primary} />
              <Text style={styles.benefitText}>Verified badge displayed on your profile</Text>
            </View>
            <View style={styles.benefitItem}>
              <CheckCircle size={20} color={Colors.primary} />
              <Text style={styles.benefitText}>Increased customer trust and credibility</Text>
            </View>
            <View style={styles.benefitItem}>
              <CheckCircle size={20} color={Colors.primary} />
              <Text style={styles.benefitText}>Stand out from unverified trucks</Text>
            </View>
            <View style={styles.benefitItem}>
              <CheckCircle size={20} color={Colors.primary} />
              <Text style={styles.benefitText}>Higher visibility in search results</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!allRequirementsMet || truck.verified) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!allRequirementsMet || truck.verified}
          activeOpacity={0.8}
        >
          <Text style={styles.submitButtonText}>
            {truck.verified ? 'Already Verified' : 'Submit for Verification'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightGray,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.gray,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  alreadyVerifiedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.success}15`,
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 24,
  },
  alreadyVerifiedText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.success,
  },
  progressCard: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  progressText: {
    fontSize: 14,
    color: Colors.gray,
    marginBottom: 12,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: Colors.lightGray,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  requirementsSection: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 16,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  requirementText: {
    flex: 1,
    fontSize: 16,
    color: Colors.dark,
  },
  requirementTextCompleted: {
    color: Colors.gray,
  },
  benefitsSection: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    padding: 20,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    color: Colors.gray,
    lineHeight: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.light,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.lightGray,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButton: {
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
  submitButtonDisabled: {
    backgroundColor: Colors.lightGray,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.light,
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
