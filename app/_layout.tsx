import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import 'react-native-reanimated';

import { AppThemeProvider, useAppTheme } from '@/src/theme/ThemeContext';
import { initializeDatabase } from '@/src/services/storage/tripStorage';
import { configureAudioSession } from '@/src/services/audio/audioPlayer';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [dbInitialized, setDbInitialized] = useState(false);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    async function initApp() {
      try {
        await initializeDatabase();
        await configureAudioSession();
      } catch (e) {
        console.error('App initialization failed:', e);
      } finally {
        setDbInitialized(true);
      }
    }
    initApp();
  }, []);

  useEffect(() => {
    if (loaded && dbInitialized) {
      SplashScreen.hideAsync();
    }
  }, [loaded, dbInitialized]);

  if (!loaded || !dbInitialized) {
    return null;
  }

  return (
    <AppThemeProvider>
      <RootLayoutNav />
    </AppThemeProvider>
  );
}

function RootLayoutNav() {
  const { colorScheme, colors } = useAppTheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.backgroundElevated },
          headerTintColor: colors.tint,
          headerTitleStyle: { color: colors.textPrimary },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="trip/prepare" options={{ title: 'Prepare Trip' }} />
        <Stack.Screen name="trip/active" options={{ title: 'Active Trip', headerBackVisible: false }} />
        <Stack.Screen name="trip/review" options={{ title: 'Trip Review' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
