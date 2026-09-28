import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import PhotoViewerModal from './PhotoViewerModal';

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
  // Full-screen viewer (see PhotoViewerModal) — lets a player see each
  // photo whole instead of the cropped strip.
  const [viewerOpen, setViewerOpen] = useState(false);
  const listRef = useRef<FlatList<ImageSourcePropType>>(null);
  // Mirrors `index` without being a dependency itself, so the effect below
  // can read the latest index without re-running every time the user
  // swipes to a new page (see comment on that effect).
  const indexRef = useRef(0);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  // Read live, not just once at module load — a value captured at import
  // time never updates, so rotating the device, resizing a split-screen/
  // multi-window app, or unfolding a foldable left the carousel (and its
  // paging math) sized for whatever width the app happened to launch at.
  const { width: screenWidth } = useWindowDimensions();

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (i !== index) setIndex(i);
  };

  // Single effect covering both triggers that need to re-align the list:
  // the owner deleting photos out from under the current page (shrinking
  // `photos.length`), and the width itself changing (rotation, split-
  // screen resize, unfolding). Merged into one effect — rather than two
  // separate ones keyed off different deps — so there's one source of
  // truth for "where should the list be scrolled to", and no risk of a
  // width-change effect re-scrolling to a since-clamped `index` from a
  // stale closure when both happen in the same render pass.
  //
  // Deliberately NOT keyed on `index`: onScroll updates `index` on every
  // user swipe, and if this effect re-ran on that too, it would call
  // scrollToOffset mid-gesture and fight the user's own drag. It only
  // needs to re-align on the two external triggers above; indexRef gives
  // it the latest index without needing index as a dependency.
  useEffect(() => {
    if (photos.length === 0) return;
    const current = indexRef.current;
    const clamped = Math.min(current, photos.length - 1);
    if (clamped !== current) {
      indexRef.current = clamped;
      setIndex(clamped);
    }
    listRef.current?.scrollToOffset({ offset: clamped * screenWidth, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length, screenWidth]);

  return (
    <View style={[styles.wrap, { width: screenWidth }]}>
      <FlatList
        ref={listRef}
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(_, i) => `venue-photo-${i}`}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setViewerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="View photo full screen"
          >
            <Image source={item} style={[styles.photo, { width: screenWidth }]} resizeMode="cover" />
          </Pressable>
        )}
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
      {photos.length > 0 && (
        <Pressable
          onPress={() => setViewerOpen(true)}
          style={styles.expandBtn}
          accessibilityRole="button"
          accessibilityLabel="View photo full screen"
        >
          <Text style={styles.expandBtnText}>⤢ View</Text>
        </Pressable>
      )}
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
      {viewerOpen && (
        <PhotoViewerModal
          photos={photos}
          startIndex={Math.min(index, photos.length - 1)}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: CAROUSEL_HEIGHT, backgroundColor: '#000' },
  photo: { height: CAROUSEL_HEIGHT },
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
  expandBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  expandBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
