import React from 'react';
import { View, Text, Image, StyleSheet, Animated } from 'react-native';
import Colors from '@/constants/colors';

type HeaderCardProps = {
  truckName: string;
  cuisineType: string;
  logoUrl?: string;
  isOpen: boolean;
  greeting?: string;
  missionLabel?: string;
  missionMessage?: string;
};

export default function HeaderCard({
  truckName,
  cuisineType,
  logoUrl,
  isOpen,
  greeting = 'Welcome back,',
  missionLabel,
  missionMessage,
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
          <Text style={styles.cuisineType} numberOfLines={1}>{cuisineType}</Text>
        </View>
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
      <View style={[styles.statusBadge, isOpen ? styles.statusOpen : styles.statusClosed]}>
        <View style={[styles.statusDot, isOpen ? styles.dotOpen : styles.dotClosed]} />
        <Text style={styles.statusText}>{isOpen ? 'Open Now' : 'Closed'}</Text>
      </View>
      {showMission ? (
        <View style={styles.briefing}>
          <Text style={styles.missionLine} numberOfLines={1}>
            {missionLabel ? (
              <Text style={styles.missionLineLabel}>{missionLabel} </Text>
            ) : null}
            {missionMessage}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primary,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    padding: 12,
    paddingBottom: 13,
    marginBottom: 8,
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
    marginBottom: 8,
  },
  textSection: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 1,
  },
  truckName: {
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '800' as const,
    color: '#fff',
    marginBottom: 1,
  },
  cuisineType: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500' as const,
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logoPlaceholderText: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#fff',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 6,
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
    marginRight: 6,
  },
  dotOpen: {
    backgroundColor: '#4CAF50',
  },
  dotClosed: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#fff',
  },
  briefing: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.24)',
  },
  missionLine: {
    fontSize: 13,
    lineHeight: 18,
    color: '#fff',
  },
  missionLineLabel: {
    fontWeight: '800' as const,
    color: 'rgba(255, 255, 255, 0.9)',
  },
});
