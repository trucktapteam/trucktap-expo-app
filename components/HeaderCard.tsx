import React from 'react';
import { View, Text, Image, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Target } from 'lucide-react-native';
import Colors from '@/constants/colors';

type HeaderCardProps = {
  truckName: string;
  cuisineType: string;
  logoUrl?: string;
  isOpen: boolean;
  greeting?: string;
  missionLabel?: string;
  missionMessage?: string;
  onMissionPress?: () => void;
  onCustomerViewPress?: () => void;
};

export default function HeaderCard({
  truckName,
  cuisineType,
  logoUrl,
  isOpen,
  greeting = 'Welcome back,',
  missionLabel,
  missionMessage,
  onMissionPress,
  onCustomerViewPress,
}: HeaderCardProps) {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const showMission = !!missionMessage;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.content}>
        <View style={styles.textSection}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.truckName} numberOfLines={1}>{truckName}</Text>
          <View style={styles.metadataRow}>
            <Text style={styles.cuisineType} numberOfLines={1}>{cuisineType}</Text>
            <View style={[styles.statusBadge, isOpen ? styles.statusOpen : styles.statusClosed]}>
              <View style={[styles.statusDot, isOpen ? styles.dotOpen : styles.dotClosed]} />
              <Text style={styles.statusText}>{isOpen ? 'Open Now' : 'Closed'}</Text>
            </View>
          </View>
        </View>
        <View style={styles.rightSection}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logo} />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoPlaceholderText}>
                {truckName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </View>
      {showMission ? (
        <TouchableOpacity
          style={styles.briefing}
          onPress={onMissionPress}
          activeOpacity={0.75}
          disabled={!onMissionPress}
          accessibilityRole={onMissionPress ? 'button' : undefined}
          accessibilityLabel={onMissionPress ? `Open next action: ${missionMessage}` : undefined}
        >
          <Target size={14} color="rgba(255, 255, 255, 0.9)" strokeWidth={2.4} />
          <Text style={styles.missionLine} numberOfLines={1}>
            {missionLabel ? (
              <Text style={styles.missionLineLabel}>{missionLabel} </Text>
            ) : null}
            {missionMessage}
          </Text>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primary,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    padding: 10,
    paddingBottom: 10,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  textSection: {
    flex: 1,
  },
  rightSection: {
    alignItems: 'flex-end',
    gap: 8,
  },
  greeting: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  truckName: {
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '800' as const,
    color: '#fff',
    marginBottom: 2,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cuisineType: {
    flexShrink: 1,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500' as const,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logoPlaceholderText: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#fff',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusOpen: {
    backgroundColor: 'rgba(76, 175, 80, 0.25)',
  },
  statusClosed: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  dotOpen: {
    backgroundColor: '#4CAF50',
  },
  dotClosed: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#fff',
  },
  briefing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
  },
  missionLine: {
    flex: 1,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
  missionLineLabel: {
    fontWeight: '800' as const,
    color: 'rgba(255, 255, 255, 0.9)',
  },
});
