import React, { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppColors } from '../colors';
import { useVenuePhotos, VenuePhoto } from '../context/VenuePhotosContext';
import AlertModal from './AlertModal';

// Owner-only screen for changing the venue photo carousel. Adding a photo
// uploads it to Supabase Storage and inserts a row players' devices pick
// up over realtime (see VenuePhotosContext) — removing one does the same
// in reverse. There's nothing in here a player's account can reach: this
// component is only ever mounted from BookingScreen when isOwner is true.
export default function VenuePhotoManagerModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { photos, uploading, addPhoto, removePhoto } = useVenuePhotos();
  const [pendingDelete, setPendingDelete] = useState<VenuePhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAlert({
        title: 'Photo access needed',
        message: 'Allow photo library access in your device settings to add venue photos.',
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      setAlert({ title: "Couldn't read photo", message: 'Please try a different photo.' });
      return;
    }

    const res = await addPhoto(asset.base64, asset.uri);
    if (!res.ok) {
      setAlert({ title: "Couldn't add photo", message: res.error ?? 'Please try again.' });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await removePhoto(pendingDelete);
    setDeleting(false);
    setPendingDelete(null);
    if (!res.ok) {
      setAlert({ title: "Couldn't remove photo", message: res.error ?? 'Please try again.' });
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.screen}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.backArrow}>←</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Venue Photos</Text>
          </View>

          <Text style={styles.helper}>
            These photos show in the carousel at the top of the booking screen for everyone —
            changes here update on players' phones automatically.
          </Text>

          <FlatList
            data={photos}
            keyExtractor={(p) => p.id}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.grid}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No custom photos yet — the default court photos are showing.</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.thumbWrap}>
                <Image source={{ uri: item.url }} style={styles.thumb} resizeMode="cover" />
                <Pressable
                  onPress={() => setPendingDelete(item)}
                  style={styles.removeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <Text style={styles.removeBtnText}>✕</Text>
                </Pressable>
              </View>
            )}
          />

          <Pressable onPress={handlePickPhoto} style={styles.addBtn} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addBtnText}>+ Add Photo</Text>
            )}
          </Pressable>
        </View>
      </Modal>

      <Modal visible={!!pendingDelete} transparent animationType="fade" onRequestClose={() => setPendingDelete(null)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmDialog}>
            <Text style={styles.confirmTitle}>Remove this photo?</Text>
            <Text style={styles.confirmMessage}>It'll disappear from every player's carousel too.</Text>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setPendingDelete(null)} style={styles.keepBtn}>
                <Text style={styles.keepBtnText}>Keep It</Text>
              </Pressable>
              <Pressable onPress={confirmDelete} style={styles.confirmBtn} disabled={deleting}>
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Remove</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <AlertModal
        visible={!!alert}
        variant="error"
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onClose={() => setAlert(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.forestGreen,
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 14,
  },
  backArrow: { color: '#fff', fontSize: 22 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  helper: { color: '#666', fontSize: 13, lineHeight: 19, padding: 16, paddingBottom: 4 },
  grid: { padding: 12, paddingBottom: 24, flexGrow: 1 },
  row: { gap: 12 },
  emptyText: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 40 },
  thumbWrap: {
    flex: 1,
    aspectRatio: 16 / 9,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  thumb: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  addBtn: {
    backgroundColor: AppColors.forestGreen,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    margin: 16,
    marginTop: 0,
  },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(4,14,20,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmDialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  confirmTitle: { fontSize: 17, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  confirmMessage: { fontSize: 14, color: '#444', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  confirmActions: { flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' },
  keepBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#eee',
  },
  keepBtnText: { color: '#333', fontWeight: '700' },
  confirmBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: AppColors.crimsonRed,
  },
  confirmBtnText: { color: '#fff', fontWeight: '700' },
});
