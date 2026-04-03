import { useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  useWindowDimensions,
  FlatList,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native'
import { Image } from 'expo-image'
import { X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'

const AnimatedImage = Animated.createAnimatedComponent(Image)

interface ImageGalleryProps {
  images: string[]
  initialIndex?: number
  visible: boolean
  onClose: () => void
}

function ZoomableImage({ uri, screenWidth, screenHeight }: { uri: string; screenWidth: number; screenHeight: number }) {
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withTiming(1)
        savedScale.value = 1
        translateX.value = withTiming(0)
        translateY.value = withTiming(0)
        savedTranslateX.value = 0
        savedTranslateY.value = 0
      } else if (scale.value > 4) {
        scale.value = withTiming(4)
        savedScale.value = 4
      } else {
        savedScale.value = scale.value
      }
    })

  const panGesture = Gesture.Pan()
    .minPointers(2)
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX
      translateY.value = savedTranslateY.value + e.translationY
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1)
        savedScale.value = 1
        translateX.value = withTiming(0)
        translateY.value = withTiming(0)
        savedTranslateX.value = 0
        savedTranslateY.value = 0
      } else {
        scale.value = withTiming(2.5)
        savedScale.value = 2.5
      }
    })

  const composed = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[zoomStyles.imageWrapper, { width: screenWidth }]}>
        <AnimatedImage
          source={{ uri }}
          style={[{ width: screenWidth, height: screenHeight }, animatedStyle]}
          contentFit="contain"
          transition={200}
        />
      </Animated.View>
    </GestureDetector>
  )
}

const zoomStyles = StyleSheet.create({
  imageWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default function ImageGallery({ images, initialIndex = 0, visible, onClose }: ImageGalleryProps) {
  const insets = useSafeAreaInsets()
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [controlsVisible, setControlsVisible] = useState(true)
  const flatListRef = useRef<FlatList>(null)

  const toggleControls = useCallback(() => {
    setControlsVisible(prev => !prev)
  }, [])

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth)
    if (index >= 0 && index < images.length) {
      setCurrentIndex(index)
    }
  }, [images.length, screenWidth])

  const getItemLayout = useCallback((_: unknown, index: number) => ({
    length: screenWidth,
    offset: screenWidth * index,
    index,
  }), [screenWidth])

  const renderItem = useCallback(({ item }: { item: string }) => (
    <Pressable onPress={toggleControls} style={{ width: screenWidth, height: screenHeight }}>
      <ZoomableImage uri={item} screenWidth={screenWidth} screenHeight={screenHeight} />
    </Pressable>
  ), [toggleControls, screenWidth, screenHeight])

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.container}>
          {/* Image list */}
          <FlatList
            ref={flatListRef}
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderItem}
            onMomentumScrollEnd={onScroll}
            initialScrollIndex={initialIndex}
            getItemLayout={getItemLayout}
            bounces={false}
          />

          {/* Controls overlay */}
          {controlsVisible && (
            <>
              {/* Counter top-left */}
              <View style={[styles.counter, { top: insets.top + 16 }]}>
                <Text style={styles.counterText}>
                  {currentIndex + 1}/{images.length}
                </Text>
              </View>

              {/* Close button top-right */}
              <Pressable
                onPress={onClose}
                hitSlop={16}
                style={[styles.closeBtn, { top: insets.top + 12 }]}
              >
                <X size={24} color="#FFFFFF" />
              </Pressable>

              {/* Dots indicator */}
              {images.length > 1 && (
                <View style={[styles.dotsContainer, { bottom: insets.bottom + 32 }]} accessibilityLabel={`Image ${currentIndex + 1} of ${images.length}`}>
                  {images.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        {
                          backgroundColor: i === currentIndex ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                          width: i === currentIndex ? 10 : 6,
                          height: i === currentIndex ? 10 : 6,
                        },
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  counter: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    borderRadius: 5,
  },
})
