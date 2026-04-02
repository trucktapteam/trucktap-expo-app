import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { ArrowLeft, Heart, Share2, Pencil } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';

type TruckHeroProps = {
  heroImage: string;
  logo: string;
  isFavorite: boolean;
  onBack: () => void;
  onToggleFavorite?: () => void;
  onShare?: () => void;
  onEdit?: () => void;
};

export default function TruckHero({ 
  heroImage, 
  logo, 
  isFavorite, 
  onBack, 
  onToggleFavorite,
  onShare,
  onEdit 
}: TruckHeroProps) {
  return (
    <View style={styles.heroContainer}>
      <Image source={{ uri: heroImage }} style={styles.heroImage} contentFit="cover" />
      
      <View style={styles.gradientOverlay} />
      
      <SafeAreaView edges={['top']} style={styles.headerOverlay}>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
            <ArrowLeft size={24} color={Colors.light} />
          </TouchableOpacity>
          {(onToggleFavorite || onShare || onEdit) && (
            <View style={styles.rightButtons}>
              {onToggleFavorite && (
                <TouchableOpacity 
                  style={[styles.favoriteButton, isFavorite && styles.favoriteButtonActive]} 
                  onPress={onToggleFavorite}
                  activeOpacity={0.7}
                >
                  <Heart 
                    size={24} 
                    color={Colors.light} 
                    fill={isFavorite ? Colors.light : 'transparent'}
                  />
                </TouchableOpacity>
              )}
              {onShare && (
                <TouchableOpacity 
                  style={styles.shareButton} 
                  onPress={onShare}
                  activeOpacity={0.7}
                >
                  <Share2 size={22} color={Colors.light} />
                </TouchableOpacity>
              )}
              {onEdit && (
                <TouchableOpacity 
                  style={styles.editButton} 
                  onPress={onEdit}
                  activeOpacity={0.7}
                >
                  <Pencil size={20} color={Colors.light} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </SafeAreaView>
      
      <View style={styles.logoContainer}>
        <View style={styles.logoWrapper}>
          <Image source={{ uri: logo }} style={styles.logo} contentFit="cover" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroContainer: {
    height: 280,
    position: 'relative',
    backgroundColor: Colors.lightGray,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  headerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  favoriteButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  favoriteButtonActive: {
    backgroundColor: Colors.primary,
  },
  rightButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  shareButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  editButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  logoContainer: {
    position: 'absolute',
    bottom: -50,
    left: 20,
  },
  logoWrapper: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.light,
    padding: 5,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
});
