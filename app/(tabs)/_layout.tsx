import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { useAppTheme } from '@/src/theme/ThemeContext';
import { Icons } from '@/src/theme/icons';
import { Typography } from '@/src/theme/theme';

/**
 * Tab Layout
 *
 * Defines the bottom tab navigator with 3 tabs:
 * 1. Explore (index) — compass/safari icon — main screen for starting new trips
 * 2. Trips (trips) — map icon — trip history & management
 * 3. Settings (settings) — gear icon — app preferences
 */
export default function TabLayout() {
  const { colors, colorScheme } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBarBackground,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: Platform.OS === 'ios' ? 0.5 : 1,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
        },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={Icons.explore}
              tintColor={color}
              size={25}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={Icons.trips}
              tintColor={color}
              size={25}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={Icons.settings}
              tintColor={color}
              size={25}
            />
          ),
        }}
      />
    </Tabs>
  );
}
