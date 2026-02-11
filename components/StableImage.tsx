import React, { memo, useMemo } from 'react';
import { Image as ExpoImage, type ImageProps as ExpoImageProps } from 'expo-image';
import { Platform, StyleSheet, type StyleProp, type ImageStyle } from 'react-native';

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
  const flatStyle = useMemo(() => StyleSheet.flatten(style) || {}, [style]);
  const webStyle = useMemo(() => {
    const resolvedFit = contentFit === 'contain' ? 'contain' : 'cover';
    return {
      ...(flatStyle as Record<string, unknown>),
      objectFit: resolvedFit,
      display: 'block',
      backfaceVisibility: 'hidden',
      WebkitUserSelect: 'none',
      userSelect: 'none',
    } as React.CSSProperties;
  }, [contentFit, flatStyle]);
  if (!uri) return null;

  if (Platform.OS === 'web') {
    return (
      <img
        src={uri}
        alt=""
        draggable={false}
        decoding="async"
        loading="eager"
        style={webStyle}
        data-testid={testID}
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

function isStyleArray(value: StyleProp<ImageStyle>): value is StyleProp<ImageStyle>[] {
  return Array.isArray(value);
}

function styleEquals(a?: StyleProp<ImageStyle>, b?: StyleProp<ImageStyle>): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  if (isStyleArray(a) && isStyleArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  return false;
}

function areEqual(prev: StableImageProps, next: StableImageProps): boolean {
  return (
    resolveUri(prev.source) === resolveUri(next.source) &&
    styleEquals(prev.style, next.style) &&
    prev.contentFit === next.contentFit &&
    prev.cachePolicy === next.cachePolicy &&
    prev.transition === next.transition &&
    prev.testID === next.testID
  );
}

const StableImage = memo(StableImageImpl, areEqual);

export default StableImage;
