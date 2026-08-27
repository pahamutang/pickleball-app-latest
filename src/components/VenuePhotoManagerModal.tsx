import React, { useMemo, useState } from 'react';
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
import { buildVenueSlides, SLOT_COUNT, VenueSlide } from '../utils/venueSlides';
import AlertModal from './AlertModal';

// Owner-only screen for changing the venue photo carousel. There are
// always 5 base slides (see utils/venueSlides.ts) — each one is either
// still showing its bundled default photo, or has been overridden with a
// custom photo the owner uploaded. Editing any one slide only ever
// touches that slide's own row (targeted by its fixed position), so
// replacing slide 1 or 2 can never affect any other slide. Extra photos
// beyond the 5 base slides can also be added and removed outright.
// There's nothing in here a player's account can reach: this component
// is only ever mounted from BookingScreen when isOwner is true.
export default function VenuePhotoManagerModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { photos, uploading, savingSlot, addPhoto, removePhoto, setSlidePhoto } = useVenuePhotos();
  const slides = useMemo(() => buildVenueSlides(photos), [photos]);
  const [pendingRemove, setPendingRemove] = useState<VenuePhoto | null>(null);
  const [removing, setRemoving] = useState(false);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  // Shared by every entry point that ends in picking a replacement image
  // — "Add Photo" and editing any individual slide. Only what happens
  // with the picked asset differs, so the picker + validation lives here.
  const pickImage = async (): Promise<{ base64: string; uri: string } | null> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAlert({
        title: 'Photo access needed',
        message: 'Allow photo library access in your device settings to add venue photos.',
      });
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    if (!asset.base64) {
      setAlert({ title: "Couldn't read photo", message: 'Please try a different photo.' });
      return null;
    }

    return { base64: asset.base64, uri: asset.uri };
  };

  const handlePickPhoto = async () => {
    const picked = await pickImage();
    if (!picked) return;

    const res = await addPhoto(picked.base64, picked.uri);
    if (!res.ok) {
      setAlert({ title: "Couldn't add photo", message: res.error ?? 'Please try again.' });
    }
  };

  // Sets the image for exactly this one slide — identified by its fixed
  // position, e.g. slide 1 is always position 0. Every other slide's
  // photo is left exactly as it was.
  const handleEditSlide = async (slide: VenueSlide) => {
    const picked = await pickImage();
    if (!picked) return;

    const position = slide.kind === 'extra' ? slide.photo.position : slide.slot;
    const existing = slide.kind === 'default' ? null : slide.photo;
    const res = await setSlidePhoto(position, existing, picked.base64, picked.uri);
    if (!res.ok) {
      setAlert({ title: "Couldn't set photo", message: res.error ?? 'Please try again.' });
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    setRemoving(true);
    const res = await removePhoto(pendingRemove);
    setRemoving(false);
    setPendingRemove(null);
    if (!res.ok) {
      setAlert({ title: "Couldn't remove photo", message: res.error ?? 'Please try again.' });
    }
  };

  const removeDialogIsRevert = pendingRemove != null && pendingRemove.position < SLOT_COUNT;

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
            Tap ✎ on any slide to replace just that photo — every other slide stays as it is.
            Changes update on players' phones automatically.
          </Text>

          <FlatList
            data={slides}
            keyExtractor={(slide, i) =>
              slide.kind === 'default' ? `slot-${slide.slot}` : `${slide.kind}-${slide.photo.id}-${i}`
            }
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.grid}
            renderItem={({ item, index }) => {
              const slotNumber = index + 1;
              const position = item.kind === 'extra' ? item.photo.position : item.slot;
              const isSaving = savingSlot === position;
              const isCustom = item.kind !== 'default';

              return (
                <View style={styles.thumbWrap}>
                  <Image source={item.source} style={styles.thumb} resizeMode="cover" />
                  <View style={styles.slideLabel}>
                    <Text style={styles.slideLabelText}>Slide {slotNumber}</Text>
                  </View>
                  {isSaving && (
                    <View style={styles.savingOverlay}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  )}
                  <Pressable
                    onPress={() => handleEditSlide(item)}
                    style={styles.editBtn}
                    disabled={isSaving || removing}
                    accessibilityRole="button"
                    accessibilityLabel={`Replace slide ${slotNumber}`}
                  >
                    <Text style={styles.editBtnText}>✎</Text>
                  </Pressable>
                  {isCustom && (
                    <Pressable
                      onPress={() => setPendingRemove(item.photo)}
                      style={styles.removeBtn}
                      disabled={isSaving}
                      accessibilityRole="button"
                      accessibilityLabel={
                        item.kind === 'custom'
                          ? `Revert slide ${slotNumber} to default`
                          : `Remove slide ${slotNumber}`
                      }
                    >
                      <Text style={styles.removeBtnText}>✕</Text>
                    </Pressable>
                  )}
                </View>
              );
            }}
          />

          <Pressable onPress={handlePickPhoto} style={styles.addBtn} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addBtnText}>+ Add Extra Photo</Text>
            )}
          </Pressable>
        </View>
      </Modal>

      <Modal visible={!!pendingRemove} transparent animationType="fade" onRequestClose={() => setPendingRemove(null)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmDialog}>
            <Text style={styles.confirmTitle}>
              {removeDialogIsRevert ? 'Revert this slide to its default photo?' : 'Remove this photo?'}
            </Text>
            <Text style={styles.confirmMessage}>
              {removeDialogIsRevert
                ? "It'll go back to the original court photo for everyone."
                : "It'll disappear from every player's carousel too."}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setPendingRemove(null)} style={styles.keepBtn}>
                <Text style={styles.keepBtnText}>Keep It</Text>
              </Pressable>
              <Pressable onPress={confirmRemove} style={styles.confirmBtn} disabled={removing}>
                {removing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>{removeDialogIsRevert ? 'Revert' : 'Remove'}</Text>
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
  thumbWrap: {
    flex: 1,
    aspectRatio: 16 / 9,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  thumb: { width: '100%', height: '100%' },
  slideLabel: {
    position: 'absolute',
    left: 6,
    top: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  slideLabelText: { color: '#fff', fontSize: 11, fontWeight: '700' },
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
  editBtn: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
