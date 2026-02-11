import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TextInput, RefreshControl, Modal, Dimensions } from 'react-native';
import Image from '@/components/StableImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Download, FileImage, FileVideo, FileText, Layout, FolderOpen, Plus, Trash2, Edit3, X, Check, ChevronLeft, Pencil } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import PlatformBadge from '@/components/PlatformBadge';
import PressableScale from '@/components/PressableScale';
import EmptyState from '@/components/EmptyState';
import { AssetType, Asset, AssetFolder, Platform as PlatformType } from '@/types';
import ImagePicker from '@/components/ImagePicker';
import { DEFAULT_ASSET_FOLDER_ID } from '@/constants/assetFolders';

type FolderKey = string;

const assetTypeConfig: Record<AssetType, { icon: typeof FileImage; label: string; color: string }> = {
  image: { icon: FileImage, label: 'Image', color: Colors.dark.primary },
  video: { icon: FileVideo, label: 'Video', color: Colors.dark.error },
  document: { icon: FileText, label: 'Document', color: Colors.dark.secondary },
  template: { icon: Layout, label: 'Template', color: Colors.dark.accent },
};

const ASSET_TYPES: AssetType[] = ['image', 'video', 'document', 'template'];
const PLATFORM_OPTIONS: PlatformType[] = ['twitter', 'instagram', 'tiktok', 'youtube'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 16;
const HORIZONTAL_PADDING = 20;
const CARD_WIDTH = (SCREEN_WIDTH - (HORIZONTAL_PADDING * 2) - CARD_GAP) / 2;
type FileInputMode = 'upload' | 'url';
const INLINE_FILE_LIMIT_BYTES = 225_000;

function estimateDataUriBytes(value: string): number | null {
  if (!value.startsWith('data:')) return null;
  const base64 = value.split(',')[1] || '';
  if (!base64) return null;
  return Math.floor((base64.length * 3) / 4);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AssetsScreen() {
  const { isAdmin } = useAuth();
  const {
    assets,
    assetFolders,
    isRefreshing,
    refreshData,
    addAsset,
    updateAsset,
    deleteAsset,
    addAssetFolder,
    updateAssetFolder,
    deleteAssetFolder,
  } = useApp();
  const [activeFolder, setActiveFolder] = useState<FolderKey | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileInputMode, setFileInputMode] = useState<FileInputMode>('upload');
  const [uploadFileSizeBytes, setUploadFileSizeBytes] = useState<number | null>(null);
  const [isFolderModalVisible, setIsFolderModalVisible] = useState(false);
  const [editingFolder, setEditingFolder] = useState<AssetFolder | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [folderColorInput, setFolderColorInput] = useState('#6366F1');

  const [formData, setFormData] = useState({
    name: '',
    type: 'image' as AssetType,
    folderId: DEFAULT_ASSET_FOLDER_ID,
    url: '',
    thumbnail: '',
    campaignTitle: '',
    platforms: [] as PlatformType[],
    format: '',
    size: '',
  });

  const getAssetsForFolder = useCallback((folderKey: FolderKey) => {
    return assets.filter(a => (a.folderId || DEFAULT_ASSET_FOLDER_ID) === folderKey);
  }, [assets]);

  const folderCounts = useMemo(() => {
    const counts: Record<FolderKey, number> = {};
    assetFolders.forEach(folder => {
      counts[folder.id] = getAssetsForFolder(folder.id).length;
    });
    return counts;
  }, [assetFolders, getAssetsForFolder]);

  const filteredAssets = useMemo(() => {
    if (!activeFolder) return [];
    
    let folderAssets = getAssetsForFolder(activeFolder);
    
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      folderAssets = folderAssets.filter(asset => 
        asset.name.toLowerCase().includes(searchLower) ||
        (asset.campaignTitle?.toLowerCase().includes(searchLower))
      );
    }
    
    return folderAssets;
  }, [activeFolder, searchQuery, getAssetsForFolder]);

  const handleRefresh = useCallback(() => {
    refreshData();
  }, [refreshData]);

  const handleDownload = useCallback((assetName: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      'Download Started',
      `${assetName} is being downloaded to your device.`,
      [{ text: 'OK' }]
    );
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      type: 'image',
      folderId: activeFolder || assetFolders[0]?.id || DEFAULT_ASSET_FOLDER_ID,
      url: '',
      thumbnail: '',
      campaignTitle: '',
      platforms: [],
      format: '',
      size: '',
    });
    setFileInputMode('upload');
    setUploadFileSizeBytes(null);
    setEditingAsset(null);
  }, [activeFolder, assetFolders]);

  const openAddModal = useCallback(() => {
    resetForm();
    setIsModalVisible(true);
  }, [resetForm]);

  const openEditModal = useCallback((asset: Asset) => {
    const initialUrl = asset.url || '';
    const initialBytes = initialUrl ? estimateDataUriBytes(initialUrl) : null;
    setFileInputMode(initialUrl && !initialUrl.startsWith('data:') ? 'url' : 'upload');
    setUploadFileSizeBytes(initialBytes);
    setEditingAsset(asset);
    setFormData({
      name: asset.name,
      type: asset.type,
      folderId: asset.folderId || DEFAULT_ASSET_FOLDER_ID,
      url: asset.url,
      thumbnail: asset.thumbnail,
      campaignTitle: asset.campaignTitle || '',
      platforms: asset.platforms,
      format: asset.format,
      size: asset.size,
    });
    setIsModalVisible(true);
  }, []);

  const togglePlatform = useCallback((platform: PlatformType) => {
    setFormData(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform],
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.name.trim() || !formData.url.trim() || formData.platforms.length === 0) {
      Alert.alert('Error', 'Please fill in name, URL, and select at least one platform');
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const assetData = {
      name: formData.name.trim(),
      type: formData.type,
      folderId: formData.folderId || DEFAULT_ASSET_FOLDER_ID,
      url: formData.url.trim(),
      thumbnail: formData.thumbnail.trim() || formData.url.trim(),
      campaignTitle: formData.campaignTitle.trim() || undefined,
      platforms: formData.platforms,
      format: formData.format.trim() || 'Unknown',
      size: formData.size.trim() || 'Unknown',
    };

    let result;
    if (editingAsset) {
      result = await updateAsset(editingAsset.id, assetData);
    } else {
      result = await addAsset(assetData);
    }

    setIsSubmitting(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsModalVisible(false);
      resetForm();
      Alert.alert('Success', editingAsset ? 'Asset updated' : 'Asset added');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', result.error || 'Failed to save asset');
    }
  }, [formData, editingAsset, addAsset, updateAsset, resetForm]);

  const handleDelete = useCallback((asset: Asset) => {
    Alert.alert(
      'Delete Asset',
      `Are you sure you want to delete "${asset.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const result = await deleteAsset(asset.id);
            if (result.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Alert.alert('Error', result.error || 'Failed to delete asset');
            }
          },
        },
      ]
    );
  }, [deleteAsset]);

  const openFolder = useCallback((folderKey: FolderKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFolder(folderKey);
    setSearchQuery('');
  }, []);

  const startEditingFolder = useCallback((folder: AssetFolder) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingFolder(folder);
    setFolderNameInput(folder.name);
    setFolderColorInput(folder.color || '#6366F1');
    setIsFolderModalVisible(true);
  }, []);

  const openCreateFolder = useCallback(() => {
    setEditingFolder(null);
    setFolderNameInput('');
    setFolderColorInput('#6366F1');
    setIsFolderModalVisible(true);
  }, []);

  const saveFolder = useCallback(async () => {
    if (!folderNameInput.trim()) {
      Alert.alert('Error', 'Folder name is required');
      return;
    }
    const payload = {
      name: folderNameInput.trim(),
      color: folderColorInput.trim() || '#6366F1',
    };
    const result = editingFolder
      ? await updateAssetFolder(editingFolder.id, payload)
      : await addAssetFolder(payload);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsFolderModalVisible(false);
      setEditingFolder(null);
      setFolderNameInput('');
      setFolderColorInput('#6366F1');
    } else {
      Alert.alert('Error', result.error || 'Failed to save folder');
    }
  }, [addAssetFolder, editingFolder, folderColorInput, folderNameInput, updateAssetFolder]);

  const handleDeleteFolder = useCallback(async () => {
    if (!editingFolder) return;
    Alert.alert(
      'Delete Folder',
      `Delete "${editingFolder.name}"? Assets inside will move to General.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteAssetFolder(editingFolder.id);
            if (result.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              if (activeFolder === editingFolder.id) {
                setActiveFolder(null);
              }
              setIsFolderModalVisible(false);
              setEditingFolder(null);
            } else {
              Alert.alert('Error', result.error || 'Failed to delete folder');
            }
          },
        },
      ]
    );
  }, [activeFolder, deleteAssetFolder, editingFolder]);

  const cancelEditingFolder = useCallback(() => {
    setEditingFolder(null);
    setFolderNameInput('');
    setFolderColorInput('#6366F1');
    setIsFolderModalVisible(false);
  }, []);

  const goBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFolder(null);
    setSearchQuery('');
  }, []);

  const activeFolderConfig = activeFolder ? assetFolders.find(f => f.id === activeFolder) : null;

  if (activeFolder && activeFolderConfig) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.folderHeader}>
            <PressableScale style={styles.backBtn} onPress={goBack} hapticType="light">
              <ChevronLeft size={24} color={Colors.dark.text} />
            </PressableScale>
            <View style={styles.folderHeaderInfo}>
              <View style={[styles.folderHeaderIcon, { backgroundColor: activeFolderConfig.color + '20' }]}>
                <FolderOpen size={20} color={activeFolderConfig.color} />
              </View>
              <View>
                <Text style={styles.title}>{activeFolderConfig.name}</Text>
                <Text style={styles.subtitle}>{filteredAssets.length} assets</Text>
              </View>
            </View>
            {isAdmin && (
              <PressableScale style={styles.addBtnSmall} onPress={openAddModal} hapticType="medium">
                <Plus size={20} color="#FFF" />
              </PressableScale>
            )}
          </View>
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchBox}>
            <Search size={20} color={Colors.dark.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search assets..."
              placeholderTextColor={Colors.dark.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              testID="search-input"
            />
            {searchQuery.length > 0 && (
              <PressableScale onPress={clearSearch} haptic={false}>
                <Text style={styles.clearBtn}>Clear</Text>
              </PressableScale>
            )}
          </View>
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.dark.primary}
              colors={[Colors.dark.primary]}
            />
          }
        >
          {filteredAssets.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="No assets found"
              message={searchQuery ? "Try adjusting your search terms" : "This folder is empty"}
              actionLabel={searchQuery ? "Clear Search" : undefined}
              onAction={searchQuery ? clearSearch : undefined}
            />
          ) : (
            <View style={styles.assetsList}>
              {filteredAssets.map((asset) => {
                const typeConfig = assetTypeConfig[asset.type];
                const TypeIcon = typeConfig.icon;

                return (
                  <View key={asset.id} style={styles.assetCard}>
                    <Image source={asset.thumbnail} style={styles.assetImage} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                    
                    <View style={styles.assetOverlay}>
                      <View style={[styles.typeBadge, { backgroundColor: typeConfig.color }]}>
                        <TypeIcon size={12} color="#FFF" />
                      </View>
                      
                      {isAdmin && (
                        <View style={styles.adminOverlay}>
                          <PressableScale
                            style={styles.adminIconBtn}
                            onPress={() => openEditModal(asset)}
                            hapticType="light"
                          >
                            <Edit3 size={14} color="#FFF" />
                          </PressableScale>
                          <PressableScale
                            style={[styles.adminIconBtn, styles.deleteBtn]}
                            onPress={() => handleDelete(asset)}
                            hapticType="light"
                          >
                            <Trash2 size={14} color="#FFF" />
                          </PressableScale>
                        </View>
                      )}
                    </View>

                    <View style={styles.assetContent}>
                      <Text style={styles.assetName} numberOfLines={1}>{asset.name}</Text>
                      {asset.campaignTitle && (
                        <Text style={styles.assetCampaign} numberOfLines={1}>{asset.campaignTitle}</Text>
                      )}
                      
                      <View style={styles.assetMeta}>
                        <Text style={styles.assetFormat}>{asset.format}</Text>
                        <View style={styles.metaDot} />
                        <Text style={styles.assetSize}>{asset.size}</Text>
                      </View>

                      <View style={styles.assetFooter}>
                        <View style={styles.assetPlatforms}>
                          {asset.platforms.slice(0, 3).map((p) => (
                            <PlatformBadge key={p} platform={p} size="small" />
                          ))}
                        </View>

                        <PressableScale 
                          style={styles.downloadBtn}
                          onPress={() => handleDownload(asset.name)}
                          hapticType="medium"
                          testID={`download-${asset.id}`}
                        >
                          <Download size={14} color={Colors.dark.primary} />
                          <Text style={styles.downloadText}>Download</Text>
                        </PressableScale>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>

        <Modal
          visible={isModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <PressableScale onPress={() => setIsModalVisible(false)}>
                <X size={24} color={Colors.dark.text} />
              </PressableScale>
              <Text style={styles.modalTitle}>{editingAsset ? 'Edit Asset' : 'Upload Asset'}</Text>
              <PressableScale onPress={handleSave} disabled={isSubmitting}>
                <Check size={24} color={isSubmitting ? Colors.dark.textMuted : Colors.dark.primary} />
              </PressableScale>
            </View>

            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                  placeholder="Asset name"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Type *</Text>
                <View style={styles.typeRow}>
                  {ASSET_TYPES.map((type) => {
                    const config = assetTypeConfig[type];
                    const Icon = config.icon;
                    return (
                      <PressableScale
                        key={type}
                        style={[
                          styles.typeOption,
                          formData.type === type && styles.typeOptionActive,
                        ]}
                        onPress={() => setFormData(prev => ({ ...prev, type }))}
                        hapticType="selection"
                      >
                        <Icon size={18} color={formData.type === type ? Colors.dark.primary : Colors.dark.textMuted} />
                        <Text style={[
                          styles.typeOptionText,
                          formData.type === type && styles.typeOptionTextActive,
                        ]}>{config.label}</Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Folder *</Text>
                <View style={styles.platformsRow}>
                  {assetFolders.map((folder) => (
                    <PressableScale
                      key={folder.id}
                      style={[
                        styles.platformOption,
                        formData.folderId === folder.id && styles.platformOptionActive,
                      ]}
                      onPress={() => setFormData(prev => ({ ...prev, folderId: folder.id }))}
                      hapticType="selection"
                    >
                      <Text style={[
                        styles.typeOptionText,
                        formData.folderId === folder.id && styles.typeOptionTextActive,
                      ]}>
                        {folder.name}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Asset File *</Text>
                <View style={styles.sourceRow}>
                  <PressableScale
                    style={[styles.sourceOption, fileInputMode === 'upload' && styles.sourceOptionActive]}
                    onPress={() => setFileInputMode('upload')}
                  >
                    <Text style={[styles.sourceOptionText, fileInputMode === 'upload' && styles.sourceOptionTextActive]}>Upload</Text>
                  </PressableScale>
                  <PressableScale
                    style={[styles.sourceOption, fileInputMode === 'url' && styles.sourceOptionActive]}
                    onPress={() => setFileInputMode('url')}
                  >
                    <Text style={[styles.sourceOptionText, fileInputMode === 'url' && styles.sourceOptionTextActive]}>URL</Text>
                  </PressableScale>
                </View>

                {fileInputMode === 'upload' ? (
                  <>
                    <ImagePicker
                      value={formData.url}
                      onChange={(uri) => {
                        const size = estimateDataUriBytes(uri);
                        setUploadFileSizeBytes(size);
                        setFormData(prev => ({ ...prev, url: uri, thumbnail: uri }));
                      }}
                      placeholder="Upload asset file"
                      height={140}
                    />
                    {uploadFileSizeBytes !== null && (
                      <Text style={[styles.imageSizeText, uploadFileSizeBytes > INLINE_FILE_LIMIT_BYTES && styles.imageSizeTextWarning]}>
                        Upload size: {formatBytes(uploadFileSizeBytes)} (recommended under {formatBytes(INLINE_FILE_LIMIT_BYTES)})
                      </Text>
                    )}
                  </>
                ) : (
                  <TextInput
                    style={styles.input}
                    value={formData.url}
                    onChangeText={(text) => {
                      setUploadFileSizeBytes(null);
                      setFormData(prev => ({ ...prev, url: text, thumbnail: text }));
                    }}
                    placeholder="https://..."
                    placeholderTextColor={Colors.dark.textMuted}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Campaign</Text>
                <TextInput
                  style={styles.input}
                  value={formData.campaignTitle}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, campaignTitle: text }))}
                  placeholder="Campaign name (optional)"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Platforms *</Text>
                <View style={styles.platformsRow}>
                  {PLATFORM_OPTIONS.map((platform) => (
                    <PressableScale
                      key={platform}
                      style={[
                        styles.platformOption,
                        formData.platforms.includes(platform) && styles.platformOptionActive,
                      ]}
                      onPress={() => togglePlatform(platform)}
                      hapticType="selection"
                    >
                      <PlatformBadge platform={platform} size="small" />
                    </PressableScale>
                  ))}
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Format</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.format}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, format: text }))}
                    placeholder="PNG, MP4, etc."
                    placeholderTextColor={Colors.dark.textMuted}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                  <Text style={styles.inputLabel}>Size</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.size}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, size: text }))}
                    placeholder="2.5 MB"
                    placeholderTextColor={Colors.dark.textMuted}
                  />
                </View>
              </View>

              <View style={styles.modalBottomPadding} />
            </ScrollView>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Asset Library</Text>
            <Text style={styles.subtitle}>{assets.length} total assets</Text>
          </View>
          <View style={styles.headerActions}>
            {isAdmin && (
              <PressableScale style={styles.addBtnSecondary} onPress={openCreateFolder} hapticType="medium">
                <FolderOpen size={16} color={Colors.dark.text} />
                <Text style={styles.addBtnSecondaryText}>Folder</Text>
              </PressableScale>
            )}
            {isAdmin && (
              <PressableScale style={styles.addBtnSmall} onPress={openAddModal} hapticType="medium">
                <Plus size={20} color="#FFF" />
                <Text style={styles.addBtnText}>Upload</Text>
              </PressableScale>
            )}
          </View>
        </View>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.dark.primary}
            colors={[Colors.dark.primary]}
          />
        }
        contentContainerStyle={styles.foldersScrollContent}
      >
        <View style={styles.foldersGrid}>
          {assetFolders.map((folder) => {
            const count = folderCounts[folder.id] || 0;
            const previewAssets = getAssetsForFolder(folder.id).slice(0, 4);
            
            return (
              <PressableScale 
                key={folder.id} 
                style={styles.folderCard}
                onPress={() => openFolder(folder.id)}
                hapticType="light"
                testID={`folder-${folder.id}`}
              >
                <View style={[styles.folderGradient, { backgroundColor: folder.color }]}>
                  <View style={styles.folderPreviewGrid}>
                    {previewAssets.length > 0 ? (
                      previewAssets.map((asset, idx) => (
                        <Image 
                          key={asset.id} 
                          source={asset.thumbnail} 
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={0}
                          style={[
                            styles.previewImage,
                            idx === 0 && styles.previewImageFirst,
                            idx === 1 && styles.previewImageSecond,
                            idx === 2 && styles.previewImageThird,
                            idx === 3 && styles.previewImageFourth,
                          ]}
                        />
                      ))
                    ) : (
                      <View style={styles.emptyPreview}>
                        <FolderOpen size={32} color="rgba(255,255,255,0.5)" />
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.folderIconBadge}>
                    <FolderOpen size={16} color="#FFF" />
                  </View>
                </View>
                
                <View style={styles.folderInfo}>
                  <View style={styles.folderNameRow}>
                    <Text style={styles.folderName} numberOfLines={1}>{folder.name}</Text>
                    {isAdmin && (
                      <PressableScale
                        style={styles.editFolderBtn}
                        onPress={() => startEditingFolder(folder)}
                        hapticType="light"
                      >
                        <Pencil size={12} color={Colors.dark.textMuted} />
                      </PressableScale>
                    )}
                  </View>
                  <Text style={styles.folderDescription}>Custom folder</Text>
                  <View style={styles.folderFooter}>
                    <Text style={styles.folderCount}>{count} {count === 1 ? 'asset' : 'assets'}</Text>
                    <View style={[styles.folderDot, { backgroundColor: folder.color || '#6366F1' }]} />
                  </View>
                </View>
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal
        visible={isFolderModalVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelEditingFolder}
      >
        <View style={styles.editFolderOverlay}>
          <View style={styles.editFolderModal}>
            <Text style={styles.editFolderTitle}>{editingFolder ? 'Edit Folder' : 'New Folder'}</Text>
            <TextInput
              style={styles.editFolderInput}
              value={folderNameInput}
              onChangeText={setFolderNameInput}
              placeholder="Folder name"
              placeholderTextColor={Colors.dark.textMuted}
              autoFocus
              selectTextOnFocus
            />
            <TextInput
              style={styles.editFolderInput}
              value={folderColorInput}
              onChangeText={setFolderColorInput}
              placeholder="#6366F1"
              placeholderTextColor={Colors.dark.textMuted}
              autoCapitalize="none"
            />
            <View style={styles.editFolderActions}>
              <PressableScale style={styles.editFolderCancelBtn} onPress={cancelEditingFolder}>
                <Text style={styles.editFolderCancelText}>Cancel</Text>
              </PressableScale>
              {editingFolder && editingFolder.id !== DEFAULT_ASSET_FOLDER_ID && (
                <PressableScale style={styles.editFolderDeleteBtn} onPress={handleDeleteFolder}>
                  <Text style={styles.editFolderDeleteText}>Delete</Text>
                </PressableScale>
              )}
              <PressableScale style={styles.editFolderSaveBtn} onPress={saveFolder}>
                <Text style={styles.editFolderSaveText}>Save</Text>
              </PressableScale>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <PressableScale onPress={() => setIsModalVisible(false)}>
              <X size={24} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>{editingAsset ? 'Edit Asset' : 'Upload Asset'}</Text>
            <PressableScale onPress={handleSave} disabled={isSubmitting}>
              <Check size={24} color={isSubmitting ? Colors.dark.textMuted : Colors.dark.primary} />
            </PressableScale>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                placeholder="Asset name"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Type *</Text>
              <View style={styles.typeRow}>
                {ASSET_TYPES.map((type) => {
                  const config = assetTypeConfig[type];
                  const Icon = config.icon;
                  return (
                    <PressableScale
                      key={type}
                      style={[
                        styles.typeOption,
                        formData.type === type && styles.typeOptionActive,
                      ]}
                      onPress={() => setFormData(prev => ({ ...prev, type }))}
                      hapticType="selection"
                    >
                      <Icon size={18} color={formData.type === type ? Colors.dark.primary : Colors.dark.textMuted} />
                      <Text style={[
                        styles.typeOptionText,
                        formData.type === type && styles.typeOptionTextActive,
                      ]}>{config.label}</Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Folder *</Text>
              <View style={styles.platformsRow}>
                {assetFolders.map((folder) => (
                  <PressableScale
                    key={folder.id}
                    style={[
                      styles.platformOption,
                      formData.folderId === folder.id && styles.platformOptionActive,
                    ]}
                    onPress={() => setFormData(prev => ({ ...prev, folderId: folder.id }))}
                    hapticType="selection"
                  >
                    <Text style={[
                      styles.typeOptionText,
                      formData.folderId === folder.id && styles.typeOptionTextActive,
                    ]}>
                      {folder.name}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Asset File *</Text>
              <View style={styles.sourceRow}>
                <PressableScale
                  style={[styles.sourceOption, fileInputMode === 'upload' && styles.sourceOptionActive]}
                  onPress={() => setFileInputMode('upload')}
                >
                  <Text style={[styles.sourceOptionText, fileInputMode === 'upload' && styles.sourceOptionTextActive]}>Upload</Text>
                </PressableScale>
                <PressableScale
                  style={[styles.sourceOption, fileInputMode === 'url' && styles.sourceOptionActive]}
                  onPress={() => setFileInputMode('url')}
                >
                  <Text style={[styles.sourceOptionText, fileInputMode === 'url' && styles.sourceOptionTextActive]}>URL</Text>
                </PressableScale>
              </View>

              {fileInputMode === 'upload' ? (
                <>
                  <ImagePicker
                    value={formData.url}
                    onChange={(uri) => {
                      const size = estimateDataUriBytes(uri);
                      setUploadFileSizeBytes(size);
                      setFormData(prev => ({ ...prev, url: uri, thumbnail: uri }));
                    }}
                    placeholder="Upload asset file"
                    height={140}
                  />
                  {uploadFileSizeBytes !== null && (
                    <Text style={[styles.imageSizeText, uploadFileSizeBytes > INLINE_FILE_LIMIT_BYTES && styles.imageSizeTextWarning]}>
                      Upload size: {formatBytes(uploadFileSizeBytes)} (recommended under {formatBytes(INLINE_FILE_LIMIT_BYTES)})
                    </Text>
                  )}
                </>
              ) : (
                <TextInput
                  style={styles.input}
                  value={formData.url}
                  onChangeText={(text) => {
                    setUploadFileSizeBytes(null);
                    setFormData(prev => ({ ...prev, url: text, thumbnail: text }));
                  }}
                  placeholder="https://..."
                  placeholderTextColor={Colors.dark.textMuted}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Campaign</Text>
              <TextInput
                style={styles.input}
                value={formData.campaignTitle}
                onChangeText={(text) => setFormData(prev => ({ ...prev, campaignTitle: text }))}
                placeholder="Campaign name (optional)"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Platforms *</Text>
              <View style={styles.platformsRow}>
                {PLATFORM_OPTIONS.map((platform) => (
                  <PressableScale
                    key={platform}
                    style={[
                      styles.platformOption,
                      formData.platforms.includes(platform) && styles.platformOptionActive,
                    ]}
                    onPress={() => togglePlatform(platform)}
                    hapticType="selection"
                  >
                    <PlatformBadge platform={platform} size="small" />
                  </PressableScale>
                ))}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Format</Text>
                <TextInput
                  style={styles.input}
                  value={formData.format}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, format: text }))}
                  placeholder="PNG, MP4, etc."
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                <Text style={styles.inputLabel}>Size</Text>
                <TextInput
                  style={styles.input}
                  value={formData.size}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, size: text }))}
                  placeholder="2.5 MB"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>
            </View>

            <View style={styles.modalBottomPadding} />
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: 4,
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    marginRight: 12,
    padding: 4,
  },
  folderHeaderInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  folderHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addBtnSecondaryText: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  addBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  searchBox: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  searchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 15,
  },
  clearBtn: {
    color: Colors.dark.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  foldersScrollContent: {
    paddingHorizontal: 20,
  },
  foldersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: CARD_GAP,
  },
  folderCard: {
    width: CARD_WIDTH,
    minWidth: 150,
    maxWidth: 200,
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  folderGradient: {
    height: 90,
    position: 'relative',
  },
  folderPreviewGrid: {
    flex: 1,
    position: 'relative',
  },
  previewImage: {
    position: 'absolute',
    width: '50%',
    height: '50%',
    opacity: 0.7,
  },
  previewImageFirst: {
    top: 0,
    left: 0,
  },
  previewImageSecond: {
    top: 0,
    right: 0,
  },
  previewImageThird: {
    bottom: 0,
    left: 0,
  },
  previewImageFourth: {
    bottom: 0,
    right: 0,
  },
  emptyPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderIconBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 8,
    borderRadius: 10,
  },
  folderInfo: {
    padding: 12,
  },
  folderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  folderName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    flex: 1,
  },
  editFolderBtn: {
    padding: 4,
    marginLeft: 4,
  },
  folderDescription: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginBottom: 8,
    lineHeight: 14,
  },
  folderFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  folderCount: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
  },
  folderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  assetsList: {
    paddingHorizontal: 20,
    gap: 16,
  },
  assetCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  assetImage: {
    width: '100%',
    height: 160,
  },
  assetOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  typeBadge: {
    padding: 8,
    borderRadius: 10,
  },
  adminOverlay: {
    flexDirection: 'row',
    gap: 6,
  },
  adminIconBtn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 8,
  },
  deleteBtn: {
    backgroundColor: Colors.dark.error + 'CC',
  },
  assetContent: {
    padding: 16,
  },
  assetName: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  assetCampaign: {
    fontSize: 13,
    color: Colors.dark.primary,
    marginBottom: 8,
  },
  assetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.textMuted,
  },
  assetFormat: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  assetSize: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  assetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assetPlatforms: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.primary + '20',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  downloadText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark.primary,
  },
  bottomPadding: {
    height: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.dark.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  sourceOption: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sourceOptionActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '20',
  },
  sourceOptionText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  sourceOptionTextActive: {
    color: Colors.dark.primary,
  },
  imageSizeText: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  imageSizeTextWarning: {
    color: Colors.dark.warning,
  },
  row: {
    flexDirection: 'row',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  typeOptionActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '20',
  },
  typeOptionText: {
    fontSize: 11,
    fontWeight: '500' as const,
    color: Colors.dark.textMuted,
  },
  typeOptionTextActive: {
    color: Colors.dark.primary,
  },
  platformsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  platformOption: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  platformOptionActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '20',
  },
  modalBottomPadding: {
    height: 40,
  },
  editFolderOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  editFolderModal: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  editFolderTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 16,
    textAlign: 'center' as const,
  },
  editFolderInput: {
    backgroundColor: Colors.dark.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 16,
  },
  editFolderActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editFolderCancelBtn: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  editFolderCancelText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
  },
  editFolderSaveBtn: {
    flex: 1,
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center' as const,
  },
  editFolderSaveText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  editFolderDeleteBtn: {
    flex: 1,
    backgroundColor: Colors.dark.error + '20',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.dark.error,
  },
  editFolderDeleteText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.error,
  },
});
