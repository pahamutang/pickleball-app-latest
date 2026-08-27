import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_HEIGHT = 240;

export default function VenuePhotoCarousel({
  photos,
  onManagePress,
}: {
  photos: ImageSourcePropType[];
  // Only ever passed in for the owner (see BookingScreen) — renders a
  // small "Edit photos" button over the carousel. Players never get this
  // prop, so they never see the button at all.
  onManagePress?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<ImageSourcePropType>>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (i !== index) setIndex(i);
  };

  // The owner can add/remove photos while this carousel is on screen (see
  // VenuePhotoManagerModal), which can shrink `photos` out from under
  // whatever page is currently showing — e.g. viewing photo 4 of 5, then
  // deleting down to 2. Without this, the counter/dots would keep
  // pointing at an index that no longer exists. Snap back to the last
  // photo (and scroll the list to match) whenever that happens.
  useEffect(() => {
    if (photos.length === 0) return;
    if (index > photos.length - 1) {
      const clamped = photos.length - 1;
      setIndex(clamped);
      listRef.current?.scrollToOffset({ offset: clamped * SCREEN_WIDTH, animated: false });
    }
  }, [photos.length, index]);

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(_, i) => `venue-photo-${i}`}
        renderItem={({ item }) => <Image source={item} style={styles.photo} resizeMode="cover" />}
      />
      <View style={styles.counterBadge}>
        <Text style={styles.counterText}>
          {Math.min(index + 1, photos.length)}/{photos.length}
        </Text>
      </View>
      <View style={styles.dots}>
        {photos.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
      {onManagePress && (
        <Pressable
          onPress={onManagePress}
          style={styles.manageBtn}
          accessibilityRole="button"
          accessibilityLabel="Edit venue photos"
        >
          <Text style={styles.manageBtnText}>✏️ Edit Photos</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SCREEN_WIDTH, height: CAROUSEL_HEIGHT, backgroundColor: '#000' },
  photo: { width: SCREEN_WIDTH, height: CAROUSEL_HEIGHT },
  counterBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 16,
  },
  manageBtn: {
    position: 'absolute',
    left: 12,
    top: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  manageBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
