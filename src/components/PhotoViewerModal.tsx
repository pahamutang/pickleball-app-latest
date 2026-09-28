import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ImageSourcePropType,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

// Full-screen photo viewer. The carousel crops photos to fill a short,
// wide strip (resizeMode "cover"), which on a desktop browser cuts off or
// stretches most of the picture. Here every photo is shown whole
// (resizeMode "contain") on a black background, so the player sees the
// complete image at any screen size.
//
// Works everywhere: swipe on phones, the ‹ › buttons on any device, and
// the ← → / Esc keys on desktop browsers.
export default function PhotoViewerModal({
  photos,
  startIndex,
  onClose,
}: {
  photos: ImageSourcePropType[];
  startIndex: number;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<ImageSourcePropType>>(null);
  const [index, setIndex] = useState(startIndex);
  const indexRef = useRef(startIndex);
  const lastIndex = photos.length - 1;

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, photos.length - 1));
      indexRef.current = clamped;
      setIndex(clamped);
      listRef.current?.scrollToOffset({ offset: clamped * width, animated: true });
    },
    [photos.length, width]
  );

  // Keyboard controls on web: ← → to browse, Esc to close.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(indexRef.current - 1);
      else if (e.key === 'ArrowRight') goTo(indexRef.current + 1);
      else if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [goTo, onClose]);

  // Keep the current photo lined up if the window is resized/rotated.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: indexRef.current * width, animated: false });
  }, [width]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== indexRef.current && i >= 0 && i <= lastIndex) {
      indexRef.current = i;
      setIndex(i);
    }
  };

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <FlatList
          ref={listRef}
          data={photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          initialScrollIndex={startIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(_, i) => `viewer-photo-${i}`}
          renderItem={({ item }) => (
            <View style={{ width, height }}>
              <Image source={item} style={styles.image} resizeMode="contain" />
            </View>
          )}
        />

        <View style={styles.counterBadge} pointerEvents="none">
          <Text style={styles.counterText}>
            {index + 1} / {photos.length}
          </Text>
        </View>

        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close photo viewer"
          hitSlop={8}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        {photos.length > 1 && (
          <>
            <Pressable
              onPress={() => goTo(index - 1)}
              disabled={index === 0}
              style={[styles.arrowBtn, styles.arrowLeft, index === 0 && styles.arrowDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Previous photo"
              hitSlop={8}
            >
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => goTo(index + 1)}
              disabled={index === lastIndex}
              style={[styles.arrowBtn, styles.arrowRight, index === lastIndex && styles.arrowDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Next photo"
              hitSlop={8}
            >
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  image: { width: '100%', height: '100%' },
  counterBadge: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  counterText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  arrowBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: { left: 14 },
  arrowRight: { right: 14 },
  arrowDisabled: { opacity: 0.25 },
  arrowText: { color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: '700' },
});
