import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { PaymentLogProvider } from './src/context/PaymentLogContext';
import { PlayersProvider } from './src/context/PlayersContext';
import HomeScreen from './src/screens/HomeScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PaymentHistoryScreen from './src/screens/PaymentHistoryScreen';
import { AppColors } from './src/colors';

type Screen = 'home' | 'settings' | 'history';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');

  return (
    <PaymentLogProvider>
      <PlayersProvider>
        <SafeAreaView style={styles.container}>
          <StatusBar style="light" backgroundColor={AppColors.forestGreen} />

          {screen === 'home' && (
            <HomeScreen onOpenSettings={() => setScreen('settings')} onOpenHistory={() => setScreen('history')} />
          )}

          {screen === 'settings' && (
            <SettingsScreen onDone={() => setScreen('home')} />
          )}

          {screen === 'history' && (
            <PaymentHistoryScreen onDone={() => setScreen('home')} />
          )}
        </SafeAreaView>
      </PlayersProvider>
    </PaymentLogProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.forestGreen },
});
