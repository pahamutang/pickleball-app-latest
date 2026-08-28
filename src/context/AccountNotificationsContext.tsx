import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../services/supabaseClient';

export interface AccountNotification {
  id: string;
  profileId: string;
  displayName: string | null;
  createdAt: string;
  seen: boolean;
}

interface AccountNotificationsValue {
  unseenCount: number;
  notifications: AccountNotification[];
  toast: AccountNotification | null;
  dismissToast: () => void;
  markAllSeen: () => Promise<void>;
}

const AccountNotificationsContext = createContext<AccountNotificationsValue | undefined>(undefined);

const MAX_LIST = 30;
const TOAST_DURATION_MS = 4000;

function rowToNotification(row: any): AccountNotification {
  return {
    id: row.id,
    profileId: row.profile_id,
    displayName: row.display_name,
    createdAt: row.created_at,
    seen: row.seen,
  };
}

// Only ever mounted inside OwnerApp (see App.tsx) — a player's account
// never gets this provider, so there's nothing for them to reach into.
//
// Notifies the owner, in-app only, when someone creates a new account:
// a Messenger-style red badge with the unseen count (NotificationBell),
// plus a small toast (NewAccountToast) when a new one arrives while this
// provider is actually mounted — i.e. only while the owner has the app
// open and is signed in as owner. There's no push notification here on
// purpose: closing the app, backgrounding it, or switching away from the
// owner account unmounts this provider and its realtime subscription
// along with it, so nothing fires unless the owner is actually looking.
export function AccountNotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [toast, setToast] = useState<AccountNotification | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from('account_notifications')
      .select('id, profile_id, display_name, created_at, seen')
      .order('created_at', { ascending: false })
      .limit(MAX_LIST);
    if (error) {
      console.warn('Failed to load account notifications', error);
      return;
    }
    setNotifications((data ?? []).map(rowToNotification));
  }, []);

  const showToast = useCallback((n: AccountNotification) => {
    setToast(n);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('account-notifications-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'account_notifications' },
        (payload) => {
          const n = rowToNotification(payload.new);
          setNotifications((prev) => [n, ...prev].slice(0, MAX_LIST));
          showToast(n);
        }
      )
      .subscribe();

    // Same reasoning as BookingContext's realtime sync: a backgrounded
    // app's websocket can get silently dropped, so re-fetch on every
    // foreground transition to pick up anything missed while away.
    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') fetchAll();
    });

    return () => {
      supabase.removeChannel(channel);
      appStateSub.remove();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [fetchAll, showToast]);

  const markAllSeen = useCallback(async () => {
    const unseenIds = notifications.filter((n) => !n.seen).map((n) => n.id);
    if (unseenIds.length === 0) return;
    // Optimistic: the badge clears the instant the owner opens the list,
    // rather than waiting on a round trip.
    setNotifications((prev) => prev.map((n) => ({ ...n, seen: true })));
    const { error } = await supabase
      .from('account_notifications')
      .update({ seen: true })
      .in('id', unseenIds);
    if (error) {
      console.warn('Failed to mark account notifications seen', error);
      fetchAll(); // reconcile with the server if the update didn't stick
    }
  }, [notifications, fetchAll]);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const unseenCount = notifications.filter((n) => !n.seen).length;

  return (
    <AccountNotificationsContext.Provider
      value={{ unseenCount, notifications, toast, dismissToast, markAllSeen }}
    >
      {children}
    </AccountNotificationsContext.Provider>
  );
}

export function useAccountNotifications() {
  const ctx = useContext(AccountNotificationsContext);
  if (!ctx) throw new Error('useAccountNotifications must be used within an AccountNotificationsProvider');
  return ctx;
}
