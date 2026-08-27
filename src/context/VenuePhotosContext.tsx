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
import type { MutationResult } from './BookingContext';

// Venue photos are a shared Supabase table + storage bucket (see
// supabase_venue_photos_migration.sql). The owner is the only one who can
// add or remove a photo, but every device — owner and players alike —
// reads the same rows and stays live-synced via realtime, the same way
// BookingContext keeps reservations in sync. When the owner changes the
// photos, every player's carousel updates on its own, no reinstall or
// manual refresh needed.

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
  addPhoto: (base64: string, sourceUri: string) => Promise<MutationResult>;
  removePhoto: (photo: VenuePhoto) => Promise<MutationResult>;
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
  const fetchingRef = useRef(false);

  const fetchAll = async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    const { data, error } = await supabase
      .from('venue_photos')
      .select('id, url, storage_path, position')
      .order('created_at', { ascending: true });
    fetchingRef.current = false;
    if (error) {
      console.warn('Failed to load venue photos', error);
      return;
    }
    const rows = (data ?? []) as VenuePhotoRow[];
    setPhotos(rows.map(rowToPhoto));
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

  const addPhoto = async (base64: string, sourceUri: string): Promise<MutationResult> => {
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return { ok: false, error: 'You need to be signed in to do that.' };

      const { path, url } = await uploadVenuePhotoFile(base64, sourceUri);

      const { data, error } = await supabase
        .from('venue_photos')
        .insert({ storage_path: path, url, created_by: userId })
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

  return (
    <VenuePhotosContext.Provider value={{ photos, loading, uploading, addPhoto, removePhoto }}>
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
