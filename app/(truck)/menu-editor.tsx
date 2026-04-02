import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Switch,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Plus, Pencil, Trash, ChevronLeft, Camera, X, ArrowUpDown, GripVertical, MoreVertical, Check, Utensils } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { MenuItem } from '@/types';
import { supabase } from '@/lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CATEGORIES = [
  'All',
  'Featured',
  'Breakfast',
  'Mains',
  'Appetizers',
  'Sides',
  'Drinks',
  'Dessert',
  'Kids',
  'Specials',
  'All Day',
];

const CATEGORY_COLORS: { [key: string]: string } = {
  Featured: '#D1C4E9',
  Breakfast: '#BFF8E1',
  Mains: '#FFC5CC',
  Appetizers: '#F3E5F5',
  Sides: '#E8F5E9',
  Drinks: '#E3F2FD',
  Dessert: '#FCE4EC',
  Kids: '#FFF3CD',
  Specials: '#EDE7F6',
  'All Day': '#FFE0B2',
};

type SortOption = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc';

export default function MenuEditor() {
  const router = useRouter();
  const { getUserTruck, menuItems, addMenuItem, updateMenuItem, deleteMenuItem } = useApp();
  const truck = getUserTruck();

  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [sortOption, setSortOption] = useState<SortOption>('name-asc');
  const [showSortMenu, setShowSortMenu] = useState<boolean>(false);

  const [formName, setFormName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formPrice, setFormPrice] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('');
  const [formImage, setFormImage] = useState<string>('');
  const [formAvailable, setFormAvailable] = useState<boolean>(true);
  const [showBulkMenu, setShowBulkMenu] = useState<boolean>(false);
  const [savedItemId, setSavedItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const modalSlideAnim = useRef(new Animated.Value(300)).current;

  const truckMenu = useMemo(() => {
    if (!truck) return [];
    return menuItems.filter(item => item.truck_id === truck.id);
  }, [menuItems, truck]);

  const filteredAndSortedMenu = useMemo(() => {
    let filtered = [...truckMenu];

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }

    filtered.sort((a, b) => {
      switch (sortOption) {
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        default:
          return 0;
      }
    });

    return filtered;
  }, [truckMenu, selectedCategory, sortOption]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (modalVisible) {
      Animated.spring(modalSlideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      modalSlideAnim.setValue(300);
    }
  }, [modalVisible]);

  useEffect(() => {
    if (savedItemId) {
      const timeout = setTimeout(() => setSavedItemId(null), 2000);
      return () => clearTimeout(timeout);
    }
  }, [savedItemId]);

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormPrice('');
    setFormCategory('');
    setFormImage('');
    setFormAvailable(true);
    setEditingItem(null);
  };

  const openAddModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormDescription(item.description);
    setFormPrice(item.price.toFixed(2));
    setFormCategory(item.category || '');
    setFormImage(item.image || '');
    setFormAvailable(item.available);
    setModalVisible(true);
  };

  const handleSave = useCallback(() => {
    if (!formName.trim() || !formDescription.trim() || !formPrice.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const price = parseFloat(formPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert('Error', 'Please enter a valid price');
      return;
    }

    if (!truck) return;

    if (editingItem) {
      updateMenuItem(editingItem.id, {
        name: formName.trim(),
        description: formDescription.trim(),
        price,
        category: formCategory.trim() || undefined,
        image: formImage.trim() || undefined,
        available: formAvailable,
      });
      setSavedItemId(editingItem.id);
    } else {
      const newId = `menu-${Date.now()}`;
      addMenuItem({
        truck_id: truck.id,
        name: formName.trim(),
        description: formDescription.trim(),
        price,
        category: formCategory.trim() || undefined,
        image: formImage.trim() || undefined,
        available: formAvailable,
      });
      setSavedItemId(newId);
    }

    setModalVisible(false);
    resetForm();
  }, [formName, formDescription, formPrice, formCategory, formImage, formAvailable, truck, editingItem, updateMenuItem, addMenuItem]);

  const handleDelete = useCallback(() => {
    if (!editingItem) return;

    Alert.alert(
      'Delete Menu Item',
      `Are you sure you want to delete "${editingItem.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setDeletingItemId(editingItem.id);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            
            setTimeout(() => {
              deleteMenuItem(editingItem.id);
              setDeletingItemId(null);
            }, 300);
            
            setModalVisible(false);
            resetForm();
          },
        },
      ]
    );
  }, [editingItem, deleteMenuItem]);

  const handleClearAll = useCallback(() => {
    Alert.alert(
      'Clear All Items',
      'Are you sure you want to delete all menu items? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            truckMenu.forEach(item => deleteMenuItem(item.id));
          },
        },
      ]
    );
  }, [truckMenu, deleteMenuItem]);

  // helper to upload a menu item image to Supabase storage and return a public URL
  const uploadMenuImageAsync = useCallback(
    async (uri: string, truckId: string): Promise<string> => {
      try {
        console.log('[MenuEditor] uploading menu image', uri);
        const response = await fetch(uri);
        const arrayBuffer = await response.arrayBuffer();
        const filePath = `${truckId}/menu-${Date.now()}.jpg`;
        console.log('[MenuEditor] storage path:', filePath);

        const { error: uploadError } = await supabase
          .storage
          .from('truck-images')
          .upload(filePath, arrayBuffer, {
            upsert: true,
            contentType: 'image/jpeg',
          });

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: { publicUrl },
        } = supabase
          .storage
          .from('truck-images')
          .getPublicUrl(filePath);

        console.log('[MenuEditor] public url retrieved', publicUrl);
        return publicUrl;
      } catch (err) {
        console.error('[MenuEditor] uploadMenuImageAsync error:', err);
        throw err;
      }
    },
    []
  );

  const pickImage = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Image Upload', 'Please paste an image URL in the field below');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const localUri = result.assets[0].uri;
      if (truck && truck.id) {
        try {
          const publicUrl = await uploadMenuImageAsync(localUri, truck.id);
          setFormImage(publicUrl);
          console.log('[MenuEditor] menu image uploaded successfully');
        } catch (error) {
          console.error('[MenuEditor] failed to upload menu image:', error);
          Alert.alert('Upload Failed', 'Failed to upload image. Please try again.');
        }
      } else {
        // no truck context, just use the local URI
        setFormImage(localUri);
      }
    }
  }, [truck, uploadMenuImageAsync]);


  const formatPriceInput = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    if (parts[1] && parts[1].length > 2) {
      return parts[0] + '.' + parts[1].slice(0, 2);
    }
    return cleaned;
  }, []);

  const getCategoryColor = useCallback((category?: string) => {
    if (!category) return '#F5F5F5';
    return CATEGORY_COLORS[category] || '#F5F5F5';
  }, []);

  const renderMenuItem = useCallback(({ item, index }: { item: MenuItem; index: number }) => {
    if (deletingItemId === item.id) return null;

    const isJustSaved = savedItemId === item.id;
    const categoryColor = getCategoryColor(item.category);

    return (
      <Animated.View
        style={[
          styles.menuCard,
          {
            opacity: fadeAnim,
            transform: [
              {
                translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [50, 0],
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.menuCardInner}
          onPress={() => openEditModal(item)}
          activeOpacity={0.7}
        >
          <View style={styles.dragHandle}>
            <GripVertical size={20} color={Colors.gray} />
          </View>
          
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.menuImage} contentFit="cover" />
          ) : (
            <View style={styles.menuImagePlaceholder}>
              <Text style={styles.placeholderText}>No Image</Text>
            </View>
          )}
          
          <View style={styles.menuInfo}>
            <Text style={styles.menuName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.menuDescription} numberOfLines={1}>
              {item.description}
            </Text>
            <View style={styles.menuFooter}>
              <Text style={styles.menuPrice}>${item.price.toFixed(2)}</Text>
              {item.category ? (
                <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
                  <Text style={styles.categoryBadgeText}>{item.category}</Text>
                </View>
              ) : null}
              {!item.available && (
                <View style={styles.unavailableBadge}>
                  <Text style={styles.unavailableText}>Unavailable</Text>
                </View>
              )}
            </View>
          </View>
          
          {isJustSaved ? (
            <View style={styles.savedIndicator}>
              <Check size={16} color={Colors.success} />
              <Text style={styles.savedText}>Saved</Text>
            </View>
          ) : (
            <Pencil size={20} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  }, [fadeAnim, deletingItemId, savedItemId, getCategoryColor]);

  const renderEmpty = useCallback(() => {
    if (selectedCategory !== 'All') {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No {selectedCategory} items</Text>
          <Text style={styles.emptySubtext}>Try a different category</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyStateIllustrated}>
        <View style={styles.emptyIconCircle}>
          <Utensils size={48} color={Colors.primary} />
        </View>
        <Text style={styles.emptyTitleLarge}>Your menu is empty</Text>
        <Text style={styles.emptyDescriptionLarge}>
          Add your first item so customers know what you&apos;re serving.
        </Text>
        <TouchableOpacity style={styles.emptyCtaButton} onPress={openAddModal}>
          <Plus size={20} color="#fff" />
          <Text style={styles.emptyCtaText}>Add First Item</Text>
        </TouchableOpacity>
      </View>
    );
  }, [selectedCategory]);

  const keyExtractor = useCallback((item: MenuItem) => item.id, []);

  const getSortLabel = () => {
    switch (sortOption) {
      case 'name-asc':
        return 'A → Z';
      case 'name-desc':
        return 'Z → A';
      case 'price-asc':
        return 'Price: Low → High';
      case 'price-desc':
        return 'Price: High → Low';
      default:
        return 'Sort';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.stickyHeader}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color={Colors.dark} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Menu Editor</Text>
            <Text style={styles.headerSubtitle}>Add and organize your food items</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setShowBulkMenu(!showBulkMenu)}
              style={styles.bulkMenuButton}
            >
              <MoreVertical size={24} color={Colors.dark} />
            </TouchableOpacity>
            <TouchableOpacity onPress={openAddModal} style={styles.addHeaderButton}>
              <Plus size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {showBulkMenu && (
          <View style={styles.bulkMenu}>
            <TouchableOpacity
              style={styles.bulkMenuItem}
              onPress={() => {
                setSortOption('name-asc');
                setShowBulkMenu(false);
              }}
            >
              <Text style={styles.bulkMenuText}>Sort A → Z</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bulkMenuItem}
              onPress={() => {
                setSortOption('price-asc');
                setShowBulkMenu(false);
              }}
            >
              <Text style={styles.bulkMenuText}>Sort by Price</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkMenuItem, styles.bulkMenuItemDanger]}
              onPress={() => {
                setShowBulkMenu(false);
                handleClearAll();
              }}
            >
              <Text style={styles.bulkMenuTextDanger}>Clear All Items</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScrollContainer}>
          <View style={styles.filtersScrollContent}>
            {CATEGORIES.map(category => (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryChip,
                  selectedCategory === category && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategory === category && styles.categoryChipTextActive,
                  ]}
                >
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => setShowSortMenu(!showSortMenu)}
        >
          <ArrowUpDown size={16} color={Colors.primary} />
          <Text style={styles.sortButtonText}>{getSortLabel()}</Text>
        </TouchableOpacity>

        {showSortMenu && (
          <View style={styles.sortMenu}>
            {[
              { value: 'name-asc' as SortOption, label: 'A → Z' },
              { value: 'name-desc' as SortOption, label: 'Z → A' },
              { value: 'price-asc' as SortOption, label: 'Price: Low → High' },
              { value: 'price-desc' as SortOption, label: 'Price: High → Low' },
            ].map(option => (
              <TouchableOpacity
                key={option.value}
                style={styles.sortOption}
                onPress={() => {
                  setSortOption(option.value);
                  setShowSortMenu(false);
                }}
              >
                <Text
                  style={[
                    styles.sortOptionText,
                    sortOption === option.value && styles.sortOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <FlatList
        data={filteredAndSortedMenu}
        renderItem={renderMenuItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        windowSize={5}
        ListFooterComponent={
          filteredAndSortedMenu.length > 0 ? (
            <View style={styles.previewSection}>
              <Text style={styles.previewTitle}>Customer Preview</Text>
              <Text style={styles.previewSubtitle}>
                How customers will see your menu items
              </Text>
              <View style={styles.previewGrid}>
                {filteredAndSortedMenu.slice(0, 6).map(item => (
                  <View key={item.id} style={styles.previewCard}>
                    {item.image ? (
                      <Image
                        source={{ uri: item.image }}
                        style={styles.previewImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.previewImagePlaceholder}>
                        <Text style={styles.previewPlaceholderText}>No Image</Text>
                      </View>
                    )}
                    <View style={styles.previewInfo}>
                      <Text style={styles.previewName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.previewPrice}>${item.price.toFixed(2)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null
        }
      />

      <Modal
        visible={modalVisible}
        animationType="none"
        transparent={false}
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setModalVisible(false);
          resetForm();
        }}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
        <Animated.View
          style={[
            styles.modalAnimatedContainer,
            {
              transform: [{ translateY: modalSlideAnim }],
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setModalVisible(false);
                resetForm();
              }}
              style={styles.closeButton}
            >
              <X size={24} color={Colors.dark} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.flex}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
          >
            <ScrollView
              style={styles.modalContent}
              contentContainerStyle={styles.modalContentContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
            <View style={styles.formGroup}>
              <Text style={styles.label}>Item Photo</Text>
              {formImage ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: formImage }} style={styles.previewImageFull} contentFit="cover" />
                  <TouchableOpacity style={styles.changePhotoButton} onPress={pickImage}>
                    <Camera size={18} color="#fff" />
                    <Text style={styles.changePhotoText}>Change Photo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.uploadPhotoButton} onPress={pickImage}>
                  <Camera size={32} color={Colors.primary} />
                  <Text style={styles.uploadPhotoText}>Upload Photo</Text>
                  <Text style={styles.uploadPhotoSubtext}>Tap to select an image</Text>
                </TouchableOpacity>
              )}
              {Platform.OS === 'web' && (
                <TextInput
                  style={[styles.input, { marginTop: 12 }]}
                  value={formImage}
                  onChangeText={setFormImage}
                  placeholder="Or paste image URL"
                  placeholderTextColor={Colors.gray}
                  autoCapitalize="none"
                />
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Item Name *</Text>
              <TextInput
                style={styles.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. Carne Asada Tacos"
                placeholderTextColor={Colors.gray}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Price *</Text>
              <View style={styles.priceInputContainer}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.priceInput}
                  value={formPrice}
                  onChangeText={(text) => setFormPrice(formatPriceInput(text))}
                  placeholder="9.99"
                  placeholderTextColor={Colors.gray}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formDescription}
                onChangeText={setFormDescription}
                placeholder="Describe your dish..."
                placeholderTextColor={Colors.gray}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categorySelector}
              >
                {CATEGORIES.filter(c => c !== 'All').map(category => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.categorySelectorChip,
                      formCategory === category && styles.categorySelectorChipActive,
                    ]}
                    onPress={() => setFormCategory(category)}
                  >
                    <Text
                      style={[
                        styles.categorySelectorText,
                        formCategory === category && styles.categorySelectorTextActive,
                      ]}
                    >
                      {category}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.formGroup}>
              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.label}>Available</Text>
                  <Text style={styles.switchSubtext}>
                    {formAvailable ? 'Customers can order' : 'Temporarily out of stock'}
                  </Text>
                </View>
                <Switch
                  value={formAvailable}
                  onValueChange={setFormAvailable}
                  trackColor={{ false: Colors.gray, true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {editingItem && (
              <TouchableOpacity style={styles.deleteButtonModal} onPress={handleDelete}>
                <Trash size={18} color={Colors.danger} />
                <Text style={styles.deleteButtonText}>Delete Item</Text>
              </TouchableOpacity>
            )}
            </ScrollView>
          </KeyboardAvoidingView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>
                {editingItem ? 'Update Item' : 'Add Item'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
  },
  flex: {
    flex: 1,
  },
  stickyHeader: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },

  backButton: {
    padding: 4,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.gray,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  bulkMenuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkMenu: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  bulkMenuItem: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  bulkMenuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  bulkMenuText: {
    fontSize: 15,
    color: Colors.dark,
    fontWeight: '600' as const,
  },
  bulkMenuTextDanger: {
    fontSize: 15,
    color: Colors.danger,
    fontWeight: '600' as const,
  },
  filtersContainer: {
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  filtersScrollContainer: {
    backgroundColor: '#fff',
    maxHeight: 50,
  },
  filtersScrollContent: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.lightGray,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.gray,
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 6,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  sortMenu: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  sortOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sortOptionText: {
    fontSize: 15,
    color: Colors.dark,
  },
  sortOptionTextActive: {
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.gray,
    textAlign: 'center',
  },
  emptyStateIllustrated: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitleLarge: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyDescriptionLarge: {
    fontSize: 15,
    color: Colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  emptyCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyCtaText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#fff',
  },
  menuCard: {
    marginBottom: 12,
  },
  menuCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  dragHandle: {
    paddingRight: 8,
    paddingLeft: 4,
  },
  menuImage: {
    width: 70,
    height: 70,
    borderRadius: 12,
    marginRight: 12,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.dark,
    opacity: 0.8,
  },
  savedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  savedText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.success,
  },
  menuImagePlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 12,
    backgroundColor: Colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  placeholderText: {
    fontSize: 10,
    color: Colors.gray,
    textAlign: 'center',
  },
  menuInfo: {
    flex: 1,
    marginRight: 8,
  },
  menuName: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 13,
    color: Colors.gray,
    marginBottom: 6,
  },
  menuFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuPrice: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  unavailableBadge: {
    backgroundColor: '#FFE5E5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  unavailableText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  previewSection: {
    padding: 20,
    paddingTop: 32,
    borderTopWidth: 8,
    borderTopColor: '#f0f0f0',
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  previewSubtitle: {
    fontSize: 13,
    color: Colors.gray,
    marginBottom: 20,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  previewCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  previewImage: {
    width: '100%',
    height: 120,
  },
  previewImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: Colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholderText: {
    fontSize: 11,
    color: Colors.gray,
  },
  previewInfo: {
    padding: 12,
  },
  previewName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  previewPrice: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalAnimatedContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.dark,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.dark,
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.dark,
  },
  uploadPhotoButton: {
    backgroundColor: Colors.lightGray,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadPhotoText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.primary,
    marginTop: 12,
  },
  uploadPhotoSubtext: {
    fontSize: 13,
    color: Colors.gray,
    marginTop: 4,
  },
  imagePreviewContainer: {
    position: 'relative',
  },
  previewImageFull: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  changePhotoButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  changePhotoText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#fff',
  },
  categorySelector: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  categorySelectorChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.lightGray,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  categorySelectorChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categorySelectorText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.gray,
  },
  categorySelectorTextActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchSubtext: {
    fontSize: 13,
    color: Colors.gray,
    marginTop: 4,
  },
  deleteButtonModal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.danger,
    gap: 8,
    marginTop: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  modalFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#fff',
  },
});
