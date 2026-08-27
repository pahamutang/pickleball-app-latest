import { decode } from 'base64-arraybuffer';
import { supabase } from './supabaseClient';

const BUCKET = 'venue-photos';

function extensionAndContentType(uri: string): { ext: string; contentType: string } {
  const match = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (match === 'png') return { ext: 'png', contentType: 'image/png' };
  if (match === 'webp') return { ext: 'webp', contentType: 'image/webp' };
  return { ext: 'jpg', contentType: 'image/jpeg' };
}

// Uploads a photo the owner picked (its local file base64, already read
// by expo-image-picker) into the public venue-photos bucket, and returns
// the storage path (needed later to delete the file) plus its public URL
// (what the carousel actually renders).
export async function uploadVenuePhotoFile(
  base64: string,
  sourceUri: string
): Promise<{ path: string; url: string }> {
  const { ext, contentType } = extensionAndContentType(sourceUri);
  const path = `venue/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(base64), { contentType, upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

// Best-effort — if this fails (e.g. the file was already removed) the
// caller still deletes the database row, so no orphaned reference is
// ever shown even if the underlying file cleanup silently fails.
export async function deleteVenuePhotoFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn('Failed to delete venue photo file', error);
}
