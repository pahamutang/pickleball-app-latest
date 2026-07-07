import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Player } from '../types';

const STORAGE_KEY = 'mt_pickle_players';

interface PlayersContextValue {
  players: Player[];
  // Exposed with the exact same signature as React's own setState so
  // HomeScreen's existing updatePlayer/handleAddPlayer/etc. logic doesn't
  // need to change at all — only the useState() call is swapped out.
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  loading: boolean;
}

const PlayersContext = createContext<PlayersContextValue | undefined>(undefined);

export function PlayersProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // Load whatever was saved last time, once, when the provider first mounts
  // (which should be near the root of the app — NOT inside a screen that
  // gets unmounted when the user navigates).
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setPlayers(JSON.parse(raw));
      } catch (e) {
        console.warn('Failed to load players', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Persist on every change, after the initial load completes (avoids
  // immediately overwriting saved data with the empty initial state).
  useEffect(() => {
    if (loading) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(players)).catch((e) =>
      console.warn('Failed to save players', e)
    );
  }, [players, loading]);

  return (
    <PlayersContext.Provider value={{ players, setPlayers, loading }}>
      {children}
    </PlayersContext.Provider>
  );
}

export function usePlayers() {
  const ctx = useContext(PlayersContext);
  if (!ctx) {
    throw new Error('usePlayers must be used within a PlayersProvider');
  }
  return ctx;
}
