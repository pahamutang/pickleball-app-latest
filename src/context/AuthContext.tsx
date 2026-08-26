import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
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

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, display_name')
      .eq('id', userId)
      .single();
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
        loadProfile(newSession.user.id);
      } else {
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
      if (data === true && session) {
        await loadProfile(session.user.id);
      }
      return data === true;
    },
    [session, loadProfile]
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
