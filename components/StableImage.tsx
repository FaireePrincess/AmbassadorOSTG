import React, { memo } from 'react';
import { Image as ExpoImage, type ImageProps as ExpoImageProps } from 'expo-image';
import { Image as RNImage, Platform, type StyleProp, type ImageStyle } from 'react-native';

type Source = string | { uri: string } | null | undefined;

interface StableImageProps {
  source: Source;
  style?: StyleProp<ImageStyle>;
  contentFit?: ExpoImageProps['contentFit'];
  cachePolicy?: ExpoImageProps['cachePolicy'];
  transition?: number;
  testID?: string;
}

function resolveUri(source: Source): string | null {
  if (!source) return null;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const trimmed = source.uri?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function StableImageImpl({ source, style, contentFit = 'cover', cachePolicy = 'memory-disk', transition = 0, testID }: StableImageProps) {
  const uri = resolveUri(source);
  if (!uri) return null;

  if (Platform.OS === 'web') {
    return (
      <RNImage
        source={{ uri }}
        style={style}
        resizeMode={contentFit === 'contain' ? 'contain' : 'cover'}
        testID={testID}
      />
    );
  }

  return (
    <ExpoImage
      source={uri}
      style={style}
      contentFit={contentFit}
      cachePolicy={cachePolicy}
      transition={transition}
      recyclingKey={uri}
      testID={testID}
    />
  );
}

function areEqual(prev: StableImageProps, next: StableImageProps): boolean {
  return (
    resolveUri(prev.source) === resolveUri(next.source) &&
    prev.style === next.style &&
    prev.contentFit === next.contentFit &&
    prev.cachePolicy === next.cachePolicy &&
    prev.transition === next.transition &&
    prev.testID === next.testID
  );
}

const StableImage = memo(StableImageImpl, areEqual);

export default StableImage;
