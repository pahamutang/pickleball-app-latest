import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppColors } from '../colors';

type Props = {
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
};

const MAP_WIDTH = 640;
const MAP_HEIGHT = 420;
const MAP_ZOOM = 15;

export default function VenueLocationCard({ address, latitude, longitude, placeId }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Wikimedia's map snapshot service — no API key needed, and it always
  // centers the image exactly on the coordinates we pass, so we can draw
  // the pin ourselves in the dead center rather than relying on a markers
  // query param.
  const staticMapUri = `https://maps.wikimedia.org/img/osm-intl,${MAP_ZOOM},${latitude},${longitude},${MAP_WIDTH}x${MAP_HEIGHT}.png`;

  const mapsUrl = placeId
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}&query_place_id=${placeId}`
    : `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  const openDirections = () => {
    const label = encodeURIComponent('MT Pickle Park');
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${latitude},${longitude}`,
      android: `geo:0,0?q=${latitude},${longitude}(${label})`,
      default: '',
    });
    if (url) {
      Linking.openURL(url).catch(() => Linking.openURL(mapsUrl));
    } else {
      Linking.openURL(mapsUrl);
    }
  };

  const openInMaps = () => {
    Linking.openURL(mapsUrl);
  };

  return (
    <View style={styles.card}>
      {/* Header — title + directions pill, like a venue detail page */}
      <View style={styles.header}>
        <Text style={styles.title}>Location</Text>
        <Pressable style={styles.directionsPill} onPress={openDirections} accessibilityRole="button">
          <Text style={styles.directionsPillText}>Get directions</Text>
          <Text style={styles.directionsPillIcon}>↗</Text>
        </Pressable>
      </View>
      <Text style={styles.address}>{address}</Text>

      {/* Open in Maps link — sits above the map preview */}
      <Pressable style={styles.openInMapsRow} onPress={openInMaps} accessibilityRole="button">
        <Text style={styles.openInMapsText}>Open in Maps</Text>
        <Text style={styles.openInMapsIcon}>↗</Text>
      </Pressable>

      {/* Map preview */}
      <Pressable onPress={openInMaps} accessibilityRole="button" style={styles.mapWrap}>
        {!failed ? (
          <>
            <Image
              source={{ uri: staticMapUri }}
              style={styles.map}
              resizeMode="cover"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
            {loaded && (
              <View style={styles.pinOverlay} pointerEvents="none">
                <View style={styles.pinDot} />
                <View style={styles.pinStem} />
              </View>
            )}
            {!loaded && (
              <View style={styles.mapLoading} pointerEvents="none">
                <ActivityIndicator color={AppColors.forestGreen} />
              </View>
            )}
          </>
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.mapFallbackPin}>📍</Text>
            <Text style={styles.mapFallbackText}>Tap to open in Maps</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  directionsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#e2e2e2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  directionsPillText: { fontSize: 12, fontWeight: '700', color: '#333' },
  directionsPillIcon: { fontSize: 12, color: '#333' },
  address: {
    fontSize: 13,
    color: '#777',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  openInMapsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  openInMapsText: { fontSize: 14, fontWeight: '700', color: '#3B82F6' },
  openInMapsIcon: { fontSize: 13, color: '#3B82F6' },
  mapWrap: { width: '100%', height: 210 },
  map: { width: '100%', height: '100%', backgroundColor: '#e6e6e6' },
  mapLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e6e6e6',
  },
  pinOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: AppColors.crimsonRed,
    borderWidth: 2,
    borderColor: '#fff',
    marginBottom: -4,
  },
  pinStem: {
    width: 2,
    height: 10,
    backgroundColor: AppColors.crimsonRed,
  },
  mapFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: AppColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mapFallbackPin: { fontSize: 26 },
  mapFallbackText: { fontSize: 12, color: '#777', fontWeight: '600' },
});
