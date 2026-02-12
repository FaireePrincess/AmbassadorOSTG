import React, { useRef, useCallback } from 'react';
import { Animated, TouchableOpacity, TouchableOpacityProps, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

interface PressableScaleProps extends TouchableOpacityProps {
  scale?: number;
  haptic?: boolean;
  hapticType?: 'light' | 'medium' | 'heavy' | 'selection';
}

export default function PressableScale({ 
  children, 
  style, 
  scale = 0.97,
  haptic = true,
  hapticType = 'light',
  onPressIn,
  onPressOut,
  onPress,
  ...props 
}: PressableScaleProps) {
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback((e: any) => {
    Animated.spring(scaleValue, {
      toValue: scale,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
    onPressIn?.(e);
  }, [scale, onPressIn, scaleValue]);

  const handlePressOut = useCallback((e: any) => {
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
    onPressOut?.(e);
  }, [onPressOut, scaleValue]);

  const handlePress = useCallback((e: any) => {
    // On web, trigger action immediately to preserve browser user-gesture semantics
    // for window.open/link navigation.
    if (Platform.OS === 'web') {
      onPress?.(e);
      return;
    }

    if (haptic) {
      const hapticMap = {
        light: Haptics.ImpactFeedbackStyle.Light,
        medium: Haptics.ImpactFeedbackStyle.Medium,
        heavy: Haptics.ImpactFeedbackStyle.Heavy,
        selection: null,
      };
      
      if (hapticType === 'selection') {
        Haptics.selectionAsync();
      } else {
        Haptics.impactAsync(hapticMap[hapticType]!);
      }
    }
    onPress?.(e);
  }, [haptic, hapticType, onPress]);

  return (
    Platform.OS === 'web' ? (
      <TouchableOpacity
        style={style}
        onPress={handlePress}
        activeOpacity={1}
        {...props}
      >
        {children}
      </TouchableOpacity>
    ) : (
      <Animated.View style={[{ transform: [{ scale: scaleValue }] }]}>
        <TouchableOpacity
          style={style}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={handlePress}
          activeOpacity={1}
          {...props}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    )
  );
}
