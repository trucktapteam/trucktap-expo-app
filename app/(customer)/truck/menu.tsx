import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, StyleSheet, FlatList, TouchableOpacity, Modal } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { Utensils, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { trackEvent } from '@/lib/analytics';
import { canViewIncompleteTruckProfile } from '@/lib/truckProfileCompleteness';
import { MenuItem } from '@/types';

export default function FullMenuScreen() {
  const { id } = useLocalSearchParams();
  const { colors } = useTheme();
  const { menuItems, foodTrucks, currentUser, isOwnerLoading } = useApp();
  const { isLoading: authLoading } = useAuth();
  const trackedMenuViewTruckIdRef = useRef<string | null>(null);
  
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [showMenuItemModal, setShowMenuItemModal] = useState<boolean>(false);
  
  const requestedTruck = useMemo(() =>
    foodTrucks.find(t => t.id === id),
    [foodTrucks, id]
  );

  const incompleteHiddenFromCustomer =
    !!requestedTruck && !canViewIncompleteTruckProfile(requestedTruck, currentUser);
  const isWaitingForVisibility =
    !!requestedTruck && incompleteHiddenFromCustomer && (authLoading || isOwnerLoading);

  const truck = useMemo(() => 
    requestedTruck &&
      requestedTruck.is_test !== true &&
      requestedTruck.archived !== true &&
      !requestedTruck.archivedAt &&
      !incompleteHiddenFromCustomer
      ? requestedTruck
      : undefined,
    [incompleteHiddenFromCustomer, requestedTruck]
  );

  const truckMenuItems = useMemo(() => 
    menuItems.filter(item => item.truck_id === id && item.available),
    [menuItems, id]
  );

  useEffect(() => {
    if (!truck || trackedMenuViewTruckIdRef.current === truck.id) {
      return;
    }

    trackedMenuViewTruckIdRef.current = truck.id;
    void trackEvent({
      event_type: 'menu_view',
      truck_id: truck.id,
      user_id: currentUser?.id ?? null,
    });
  }, [currentUser?.id, truck]);

  const styles = createStyles(colors);

  if (isWaitingForVisibility) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!truck) {
    return (
      <View style={styles.container}>
        {incompleteHiddenFromCustomer ? (
          <Text style={styles.errorText}>This truck profile is still being completed.</Text>
        ) : (
          <Text style={styles.errorText}>Truck not found</Text>
        )}
      </View>
    );
  }

  const renderMenuItem = ({ item }: { item: MenuItem }) => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={() => {
        setSelectedMenuItem(item);
        setShowMenuItemModal(true);
      }}
      activeOpacity={0.7}
    >
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.menuItemImage} contentFit="cover" />
      ) : (
        <View style={styles.menuItemImagePlaceholder}>
          <Utensils size={40} color={colors.secondaryText} />
        </View>
      )}
      <View style={styles.menuItemInfo}>
        <Text style={styles.menuItemName}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.menuItemDescription} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <Text style={styles.menuItemPrice}>${item.price.toFixed(2)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: `${truck.name} - Menu`,
          headerShown: true,
          headerBackTitle: 'Back',
        }}
      />
      
      {truckMenuItems.length > 0 ? (
        <FlatList
          data={truckMenuItems}
          renderItem={renderMenuItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyState}>
          <Utensils size={64} color={colors.secondaryText} />
          <Text style={styles.emptyText}>Menu coming soon</Text>
        </View>
      )}

      <Modal
        visible={showMenuItemModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMenuItemModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.menuItemModalContent}>
            <TouchableOpacity 
              style={styles.menuItemModalClose}
              onPress={() => setShowMenuItemModal(false)}
            >
              <X size={24} color={colors.text} />
            </TouchableOpacity>
            
            {selectedMenuItem && (
              <>
                {selectedMenuItem.image ? (
                  <Image 
                    source={{ uri: selectedMenuItem.image }} 
                    style={styles.menuItemModalImage}
                    contentFit="contain"
                  />
                ) : (
                  <View style={styles.menuItemModalImagePlaceholder}>
                    <Utensils size={64} color={colors.secondaryText} />
                  </View>
                )}
                
                <View style={styles.menuItemModalInfo}>
                  <Text style={styles.menuItemModalName}>{selectedMenuItem.name}</Text>
                  <Text style={styles.menuItemModalPrice}>${selectedMenuItem.price.toFixed(2)}</Text>
                  {selectedMenuItem.description ? (
                    <Text style={styles.menuItemModalDescription}>{selectedMenuItem.description}</Text>
                  ) : null}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorText: {
      fontSize: 16,
      color: colors.secondaryText,
      textAlign: 'center',
      marginTop: 40,
    },
    listContent: {
      padding: 16,
      paddingBottom: 32,
    },
    menuItem: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 16,
      marginBottom: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    menuItemImage: {
      width: 120,
      height: 120,
    },
    menuItemImagePlaceholder: {
      width: 120,
      height: 120,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    menuItemInfo: {
      flex: 1,
      padding: 16,
      justifyContent: 'center',
    },
    menuItemName: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    menuItemDescription: {
      fontSize: 14,
      color: colors.secondaryText,
      marginBottom: 8,
      lineHeight: 18,
    },
    menuItemPrice: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.primary,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    emptyText: {
      fontSize: 16,
      color: colors.secondaryText,
      marginTop: 16,
      textAlign: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    menuItemModalContent: {
      backgroundColor: colors.card,
      borderRadius: 20,
      width: '90%',
      maxWidth: 400,
      overflow: 'hidden',
    },
    menuItemModalClose: {
      position: 'absolute',
      top: 16,
      right: 16,
      zIndex: 10,
      backgroundColor: colors.background,
      borderRadius: 20,
      padding: 8,
    },
    menuItemModalImage: {
      width: '100%',
      height: 240,
    },
    menuItemModalImagePlaceholder: {
      width: '100%',
      height: 240,
      backgroundColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    menuItemModalInfo: {
      padding: 24,
    },
    menuItemModalName: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    menuItemModalPrice: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.primary,
      marginBottom: 16,
    },
    menuItemModalDescription: {
      fontSize: 16,
      color: colors.secondaryText,
      lineHeight: 24,
    },
  });
}
