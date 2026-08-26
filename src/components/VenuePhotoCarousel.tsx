import React, { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_HEIGHT = 240;

export default function VenuePhotoCarousel({ photos }: { photos: ImageSourcePropType[] }) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<ImageSourcePropType>>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (i !== index) setIndex(i);
  };

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
          {index + 1}/{photos.length}
        </Text>
      </View>
      <View style={styles.dots}>
        {photos.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
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
});
