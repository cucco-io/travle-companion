/**
 * src/theme/ThemeContext.tsx
 *
 * React context providing theme colors + user preference management.
 * Supports three modes: 'system', 'light', 'dark'.
 * Persists preference to settingsStorage.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { LightColors, DarkColors, type ThemeColors } from './theme';
import { loadSettings, updateSettings } from '@/src/services/storage/settingsStorage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedColorScheme = 'light' | 'dark';

interface ThemeContextValue {
  /** Resolved color tokens for the current mode */
  colors: ThemeColors;
  /** The resolved color scheme ('light' or 'dark') */
  colorScheme: ResolvedColorScheme;
  /** The user's preference ('system', 'light', or 'dark') */
  themePreference: ThemePreference;
  /** Update the theme preference */
  setThemePreference: (pref: ThemePreference) => void;
  /** Whether the theme is still loading from storage */
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: LightColors,
  colorScheme: 'light',
  themePreference: 'system',
  setThemePreference: () => {},
  isLoading: true,
});

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [isLoading, setIsLoading] = useState(true);

  // Load saved preference on mount
  useEffect(() => {
    (async () => {
      try {
        const settings = await loadSettings();
        if (settings.themePreference) {
          setThemePreferenceState(settings.themePreference);
        }
      } catch (e) {
        console.warn('[ThemeContext] Failed to load theme preference:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Persist preference changes
  const setThemePreference = useCallback(async (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    try {
      await updateSettings({ themePreference: pref });
    } catch (e) {
      console.warn('[ThemeContext] Failed to save theme preference:', e);
    }
  }, []);

  // Resolve the actual color scheme
  const colorScheme: ResolvedColorScheme = useMemo(() => {
    if (themePreference === 'system') {
      return systemScheme === 'dark' ? 'dark' : 'light';
    }
    return themePreference;
  }, [themePreference, systemScheme]);

  const colors = colorScheme === 'dark' ? DarkColors : LightColors;

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      colorScheme,
      themePreference,
      setThemePreference,
      isLoading,
    }),
    [colors, colorScheme, themePreference, setThemePreference, isLoading]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme colors and preferences.
 */
export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
