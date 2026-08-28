import AsyncStorage from '@react-native-async-storage/async-storage';

// Stores the owner email / session title on-device so the user only has
// to type them in once. Unlike the old Flutter version, there's no app
// password to store — email/password auth via Supabase (see AuthContext)
// handles auth, and nothing sensitive is persisted here.
const K_OWNER_EMAIL = 'owner_email';
const K_SESSION_TITLE = 'session_title';

export interface Settings {
  ownerEmail: string;
  sessionTitle: string;
}

export async function loadSettings(): Promise<Settings> {
  const [ownerEmail, sessionTitle] = await Promise.all([
    AsyncStorage.getItem(K_OWNER_EMAIL),
    AsyncStorage.getItem(K_SESSION_TITLE),
  ]);
  return {
    ownerEmail: ownerEmail ?? '',
    sessionTitle: sessionTitle ?? 'Pickleball Session',
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(K_OWNER_EMAIL, settings.ownerEmail),
    AsyncStorage.setItem(K_SESSION_TITLE, settings.sessionTitle),
  ]);
}
