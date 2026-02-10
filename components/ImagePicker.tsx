import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Image, Alert, Platform } from 'react-native';
import * as ImagePickerLib from 'expo-image-picker';
import { Camera, ImagePlus, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import PressableScale from './PressableScale';

interface ImagePickerProps {
  value: string;
  onChange: (uri: string) => void;
  placeholder?: string;
  aspectRatio?: [number, number];
  height?: number;
}

export default function ImagePicker({
  value,
  onChange,
  placeholder = 'Add an image',
  aspectRatio = [16, 9],
  height = 160,
}: ImagePickerProps) {
  const requestPermissions = useCallback(async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePickerLib.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to upload images.',
          [{ text: 'OK' }]
        );
        return false;
      }
    }
    return true;
  }, []);

  const pickImage = useCallback(async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePickerLib.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: aspectRatio,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const asset = result.assets[0];
        if (asset.base64) {
          const mimeType = asset.mimeType || 'image/jpeg';
          const dataUri = `data:${mimeType};base64,${asset.base64}`;
          onChange(dataUri);
        } else if (asset.uri) {
          onChange(asset.uri);
        }
      }
    } catch (error) {
      console.log('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  }, [requestPermissions, aspectRatio, onChange]);

  const takePhoto = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Camera is not available on web.');
      return;
    }

    const { status } = await ImagePickerLib.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow camera access to take photos.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      const result = await ImagePickerLib.launchCameraAsync({
        allowsEditing: true,
        aspect: aspectRatio,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const asset = result.assets[0];
        if (asset.base64) {
          const mimeType = asset.mimeType || 'image/jpeg';
          const dataUri = `data:${mimeType};base64,${asset.base64}`;
          onChange(dataUri);
        } else if (asset.uri) {
          onChange(asset.uri);
        }
      }
    } catch (error) {
      console.log('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  }, [aspectRatio, onChange]);

  const showOptions = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (Platform.OS === 'web') {
      pickImage();
      return;
    }

    Alert.alert(
      'Add Image',
      'Choose how to add an image',
      [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [pickImage, takePhoto]);

  const removeImage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange('');
  }, [onChange]);

  if (value) {
    return (
      <View style={[styles.previewContainer, { height }]}>
        <Image source={{ uri: value }} style={styles.preview} />
        <PressableScale
          style={styles.removeBtn}
          onPress={removeImage}
          hapticType="light"
        >
          <X size={16} color="#FFF" />
        </PressableScale>
        <PressableScale
          style={styles.changeBtn}
          onPress={showOptions}
          hapticType="light"
        >
          <ImagePlus size={14} color="#FFF" />
          <Text style={styles.changeBtnText}>Change</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <PressableScale
      style={[styles.placeholder, { height }]}
      onPress={showOptions}
      hapticType="light"
    >
      <View style={styles.placeholderContent}>
        <View style={styles.iconRow}>
          <View style={styles.iconCircle}>
            <ImagePlus size={24} color={Colors.dark.primary} />
          </View>
          {Platform.OS !== 'web' && (
            <View style={styles.iconCircle}>
              <Camera size={24} color={Colors.dark.primary} />
            </View>
          )}
        </View>
        <Text style={styles.placeholderText}>{placeholder}</Text>
        <Text style={styles.placeholderHint}>
          {Platform.OS === 'web' ? 'Click to browse' : 'Tap to upload or take photo'}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  previewContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    padding: 6,
  },
  changeBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  placeholder: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderContent: {
    alignItems: 'center',
    gap: 10,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.text,
  },
  placeholderHint: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
});
