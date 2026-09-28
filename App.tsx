import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { PaymentLogProvider } from './src/context/PaymentLogContext';
import { PlayersProvider } from './src/context/PlayersContext';
import { BookingProvider } from './src/context/BookingContext';
import { VenuePhotosProvider } from './src/context/VenuePhotosContext';
import { AccountNotificationsProvider } from './src/context/AccountNotificationsContext';
import BookingScreen from './src/screens/BookingScreen';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PaymentHistoryScreen from './src/screens/PaymentHistoryScreen';
import AuthScreen from './src/screens/AuthScreen';
import MyBillScreen from './src/screens/MyBillScreen';
import NewAccountToast from './src/components/NewAccountToast';
import { AppColors } from './src/colors';
import { DialogHost } from './src/utils/dialog';

type MainTab = 'booking' | 'legacy';
type LegacyScreen = 'home' | 'settings' | 'history';

// The full owner app — booking + the legacy session/payment tracker, and
// everything that can add players, log orders, or mark things paid. Only
// ever rendered once we know the signed-in account's role is 'owner'; a
// player's account never even receives these providers or components, so
// there's nothing for them to reach into.
function OwnerApp() {
  const [mainTab, setMainTab] = useState<MainTab>('booking');
  const [legacyScreen, setLegacyScreen] = useState<LegacyScreen>('home');

  return (
    <PaymentLogProvider>
      <PlayersProvider>
        <BookingProvider>
          <VenuePhotosProvider>
            {/* Only ever mounted here — new-account badge/toast only exist
                for the owner, and only while the owner's app is actually
                open (mounting/unmounting this provider is what turns the
                realtime subscription behind it on and off). */}
            <AccountNotificationsProvider>
              <View style={styles.ownerAppRoot}>
                {mainTab === 'booking' && (
                  <BookingScreen onOpenLegacy={() => setMainTab('legacy')} />
                )}

                {mainTab === 'legacy' && legacyScreen === 'home' && (
                  <HomeScreen
                    onOpenSettings={() => setLegacyScreen('settings')}
                    onOpenHistory={() => setLegacyScreen('history')}
                    onOpenBooking={() => setMainTab('booking')}
                  />
                )}

                {mainTab === 'legacy' && legacyScreen === 'settings' && (
                  <SettingsScreen onDone={() => setLegacyScreen('home')} />
                )}

                {mainTab === 'legacy' && legacyScreen === 'history' && (
                  <PaymentHistoryScreen onDone={() => setLegacyScreen('home')} />
                )}

                <NewAccountToast />
              </View>
            </AccountNotificationsProvider>
          </VenuePhotosProvider>
        </BookingProvider>
      </PlayersProvider>
    </PaymentLogProvider>
  );
}

type PlayerTab = 'booking' | 'bill';

// A player's account: straight to the app after login — two tabs, Book a
// Court and My Bill, and nothing else. This function never imports or
// renders HomeScreen, SettingsScreen, or PaymentHistoryScreen (the
// owner-only add-player/log-order/mark-paid screens) — a player's account
// never even receives those components, so there's nothing here for them
// to reach into. BookingContext is the only provider shared with the owner
// side, and it's the same shared Supabase table both roles read from (see
// supabase_reservations_migration.sql) — what a player books shows up for
// the owner right away, and vice versa.
function PlayerApp() {
  const [tab, setTab] = useState<PlayerTab>('booking');

  return (
    <BookingProvider>
      <VenuePhotosProvider>
        {tab === 'booking' ? (
          <BookingScreen onOpenBill={() => setTab('bill')} />
        ) : (
          <MyBillScreen onBack={() => setTab('booking')} />
        )}
      </VenuePhotosProvider>
    </BookingProvider>
  );
}

// Decides what to show based on auth state + role.
function RootRouter() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (!session || !profile) {
    return <AuthScreen />;
  }

  return profile.role === 'owner' ? <OwnerApp /> : <PlayerApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" backgroundColor={AppColors.forestGreen} />
        <RootRouter />
        <DialogHost />
      </SafeAreaView>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.forestGreen },
  ownerAppRoot: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.forestGreen,
  },
});
