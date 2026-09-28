import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';

export type Role = 'owner' | 'player';

interface Profile {
  id: string;
  role: Role;
  display_name: string | null;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  // Returns true if the pin matched and the account is now the owner.
  claimOwnerRole: (pin: string) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Which user the latest loadProfile call was for. A slow response for a
  // previous user (sign out -> sign in as someone else) must never land
  // after a newer one and overwrite it with the wrong role/name.
  const latestProfileUserRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    latestProfileUserRef.current = userId;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, display_name')
      .eq('id', userId)
      .single();
    if (latestProfileUserRef.current !== userId) return; // superseded
    if (error) {
      console.warn('Failed to load profile', error);
      setProfile(null);
      return;
    }
    setProfile(data as Profile);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        // If a DIFFERENT account just signed in, drop the previous
        // account's profile right away. Otherwise RootRouter keeps
        // rendering the old role's screens (e.g. the owner app for a
        // player who just signed in on the same device) until the new
        // profile finishes loading.
        setProfile((prev) => (prev && prev.id !== newSession.user.id ? null : prev));
        loadProfile(newSession.user.id);
      } else {
        latestProfileUserRef.current = null;
        setProfile(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    return error ? error.message : null;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const claimOwnerRole = useCallback(
    async (pin: string) => {
      const { data, error } = await supabase.rpc('claim_owner_role', { pin });
      if (error) {
        console.warn('claim_owner_role failed', error);
        return false;
      }
      if (data === true) {
        // Don't use the `session` captured in this callback's closure —
        // this is very often called immediately after signUp(), and this
        // closure can still be holding the pre-signup snapshot (`session`
        // was null when it was created), which silently skipped the
        // profile reload below and left the UI showing the player screens
        // until the next app launch, even though the database's role had
        // already been updated correctly. Ask Supabase for the session
        // fresh instead — we know one exists, since the RPC call above
        // only succeeds when authenticated.
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          await loadProfile(sessionData.session.user.id);
        }
      }
      return data === true;
    },
    [loadProfile]
  );

  const refreshProfile = useCallback(async () => {
    if (session) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, signUp, signIn, signOut, claimOwnerRole, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
