import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { supabase } from '../services/supabaseClient';
import { uploadVenuePhotoFile, deleteVenuePhotoFile } from '../services/venuePhotoStorage';
import { nextExtraPosition } from '../utils/venueSlides';
import type { MutationResult } from './BookingContext';

// Venue photos are a shared Supabase table + storage bucket (see
// supabase_venue_photos_migration.sql). The owner is the only one who can
// add or remove a photo, but every device — owner and players alike —
// reads the same rows and stays live-synced via realtime, the same way
// BookingContext keeps reservations in sync. When the owner changes the
// photos, every player's carousel updates on its own, no reinstall or
// manual refresh needed.
//
// `position` is what makes a slide independently targetable: 0-4 map to
// the 5 bundled default slides (see utils/venueSlides.ts), and a row at
// one of those positions overrides that exact slide and no other.
// Anything at position >= 5 is an extra photo appended after them.

export interface VenuePhoto {
  id: string;
  url: string;
  storagePath: string;
  position: number;
}

interface VenuePhotosContextValue {
  photos: VenuePhoto[];
  loading: boolean;
  uploading: boolean;
  savingSlot: number | null;
  addPhoto: (base64: string, sourceUri: string) => Promise<MutationResult>;
  removePhoto: (photo: VenuePhoto) => Promise<MutationResult>;
  // Sets the image for one exact slide position. If a custom photo
  // already occupies that position, its file/row is updated in place. If
  // not (a still-default slide), a new row is inserted at that position.
  // Either way, only this one position is ever touched.
  setSlidePhoto: (
    position: number,
    existing: VenuePhoto | null,
    base64: string,
    sourceUri: string
  ) => Promise<MutationResult>;
}

const VenuePhotosContext = createContext<VenuePhotosContextValue | undefined>(undefined);

type VenuePhotoRow = {
  id: string;
  url: string;
  storage_path: string;
  position: number;
};

function rowToPhoto(row: VenuePhotoRow): VenuePhoto {
  return { id: row.id, url: row.url, storagePath: row.storage_path, position: row.position };
}

function describeError(error: unknown): string {
  const raw = (error as any)?.message as string | undefined;
  const code = (error as any)?.code as string | undefined;
  if (!raw) return 'Something went wrong. Please try again.';
  const lower = raw.toLowerCase();
  if (
    (lower.includes('relation') && lower.includes('does not exist')) ||
    code === 'PGRST205' ||
    lower.includes('schema cache') ||
    lower.includes('bucket not found')
  ) {
    return "Venue photos haven't been set up in Supabase yet. Run supabase_venue_photos_migration.sql in the Supabase SQL editor, then try again.";
  }
  if (lower.includes('row-level security') || lower.includes('policy')) {
    return "You don't have permission to do that.";
  }
  return raw;
}

export function VenuePhotosProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<VenuePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  // See the matching comment in BookingContext.tsx: coalesce overlapping
  // refetch requests instead of dropping them, so a burst of realtime
  // events (e.g. several photo slots saved in quick succession) never
  // leaves `photos` stuck missing one of them.
  const fetchingRef = useRef(false);
  const refetchPendingRef = useRef(false);

  const fetchAll = async () => {
    if (fetchingRef.current) {
      refetchPendingRef.current = true;
      return;
    }
    fetchingRef.current = true;
    try {
      do {
        refetchPendingRef.current = false;
        const { data, error } = await supabase
          .from('venue_photos')
          .select('id, url, storage_path, position')
          .order('position', { ascending: true });
        if (error) {
          console.warn('Failed to load venue photos', error);
          break;
        }
        const rows = (data ?? []) as VenuePhotoRow[];
        setPhotos(rows.map(rowToPhoto));
      } while (refetchPendingRef.current);
    } finally {
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    (async () => {
      await fetchAll();
      setLoading(false);
    })();

    const channel = supabase
      .channel('venue-photos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_photos' }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adds an extra photo after the 5 base slides — never touches or
  // reorders any existing slide, base or extra.
  const addPhoto = async (base64: string, sourceUri: string): Promise<MutationResult> => {
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return { ok: false, error: 'You need to be signed in to do that.' };

      const { path, url } = await uploadVenuePhotoFile(base64, sourceUri);
      const position = nextExtraPosition(photos);

      const { data, error } = await supabase
        .from('venue_photos')
        .insert({ storage_path: path, url, position, created_by: userId })
        .select('id, url, storage_path, position')
        .single();

      if (error) {
        // Clean up the uploaded file so it doesn't linger with no row.
        await deleteVenuePhotoFile(path);
        console.warn('Failed to save venue photo', error);
        return { ok: false, error: describeError(error) };
      }

      setPhotos((prev) => {
        const newPhoto = rowToPhoto(data as VenuePhotoRow);
        // A realtime event for this same insert can arrive and call
        // fetchAll() before this line runs, already adding the row from
        // the server. Guard so it isn't appended a second time.
        return prev.some((p) => p.id === newPhoto.id) ? prev : [...prev, newPhoto];
      });
      return { ok: true };
    } catch (error) {
      console.warn('Failed to upload venue photo', error);
      return { ok: false, error: describeError(error) };
    } finally {
      setUploading(false);
    }
  };

  // Removing a base slide's (position 0-4) custom photo just deletes its
  // row — the carousel then falls back to that slide's bundled default
  // (see buildVenueSlides), it never disappears. Removing an extra photo
  // (position >= 5) removes that slide outright, since it has no default
  // to fall back to.
  const removePhoto = async (photo: VenuePhoto): Promise<MutationResult> => {
    const { error } = await supabase.from('venue_photos').delete().eq('id', photo.id);
    if (error) {
      console.warn('Failed to remove venue photo', error);
      return { ok: false, error: describeError(error) };
    }
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    await deleteVenuePhotoFile(photo.storagePath);
    return { ok: true };
  };

  // Sets the photo for one exact slide, addressed by its stable position
  // — not by list index — so this can never drift onto the wrong slide
  // even if other rows are added or removed around the same time. The new
  // file uploads under its own unique path first; only once the DB write
  // for THIS position succeeds does the previous file (if any) for THIS
  // position get cleaned up. Every other row, and every other slide, is
  // left completely untouched.
  const setSlidePhoto = async (
    position: number,
    existing: VenuePhoto | null,
    base64: string,
    sourceUri: string
  ): Promise<MutationResult> => {
    setSavingSlot(position);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return { ok: false, error: 'You need to be signed in to do that.' };

      const { path, url } = await uploadVenuePhotoFile(base64, sourceUri);

      if (existing) {
        // This slide already has a custom photo — update that one row by
        // its id. Its position never changes.
        const { data, error } = await supabase
          .from('venue_photos')
          .update({ storage_path: path, url })
          .eq('id', existing.id)
          .select('id, url, storage_path, position')
          .single();

        if (error) {
          await deleteVenuePhotoFile(path);
          console.warn('Failed to replace venue photo', error);
          return { ok: false, error: describeError(error) };
        }

        const updated = rowToPhoto(data as VenuePhotoRow);
        setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        await deleteVenuePhotoFile(existing.storagePath);
        return { ok: true };
      }

      // This slide is still showing its bundled default — insert a new
      // row at exactly this position so it (and only it) is overridden.
      const { data, error } = await supabase
        .from('venue_photos')
        .insert({ storage_path: path, url, position, created_by: userId })
        .select('id, url, storage_path, position')
        .single();

      if (error) {
        await deleteVenuePhotoFile(path);
        console.warn('Failed to save venue photo', error);
        return { ok: false, error: describeError(error) };
      }

      setPhotos((prev) => {
        const newPhoto = rowToPhoto(data as VenuePhotoRow);
        return prev.some((p) => p.id === newPhoto.id) ? prev : [...prev, newPhoto];
      });
      return { ok: true };
    } catch (error) {
      console.warn('Failed to upload venue photo', error);
      return { ok: false, error: describeError(error) };
    } finally {
      setSavingSlot(null);
    }
  };

  return (
    <VenuePhotosContext.Provider
      value={{ photos, loading, uploading, savingSlot, addPhoto, removePhoto, setSlidePhoto }}
    >
      {children}
    </VenuePhotosContext.Provider>
  );
}

export function useVenuePhotos() {
  const ctx = useContext(VenuePhotosContext);
  if (!ctx) {
    throw new Error('useVenuePhotos must be used within a VenuePhotosProvider');
  }
  return ctx;
}
