import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';

import { Text, View } from '@/components/Themed';

/**
 * Active Travel Screen
 *
 * The main screen shown during an active trip. Displays real-time
 * proximity information and narration controls.
 *
 * TODO for implementer:
 * - Top section: Mini-map showing user's location, nearby POIs, and route
 * - Middle section: Current/next POI card:
 *   - POI name, category icon, distance ("0.3 mi away")
 *   - POI image (if available)
 *   - Narration status (loading, playing, paused, queued)
 * - Narration player controls:
 *   - Play/Pause button (large, centered)
 *   - Skip button
 *   - Replay button
 *   - Progress bar (for .mp3 playback)
 * - Bottom section: Trip stats bar:
 *   - POIs played: 5/25
 *   - Time elapsed
 *   - Distance traveled
 * - "End Trip" button (with confirmation dialog)
 *
 * Real-time features:
 * - GPS tracking with adaptive accuracy modes
 * - Proximity-based narration triggers
 * - Audio ducking with navigation apps
 * - Background playback (screen off)
 *
 * Hooks used:
 * - src/hooks/useProximityTrigger.ts
 * - src/hooks/useNarrationPlayer.ts
 * - src/hooks/useGpsTracking.ts
 *
 * Navigation:
 * - "End Trip" → app/trip/review.tsx
 * - Back button should be disabled/hidden during active trip
 *
 * Keep-awake:
 * - Use expo-keep-awake to prevent screen dimming during active travel
 */
export default function TripActiveScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Active Trip', headerBackVisible: false }} />
      <View style={styles.container}>
        <Text style={styles.title}>🚗 Trip in Progress</Text>
        <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>🗺️</Text>
          <Text style={styles.placeholderLabel}>Mini-map with POI markers goes here</Text>
        </View>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>🎧</Text>
          <Text style={styles.placeholderLabel}>Current POI card & narration player goes here</Text>
        </View>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>📊</Text>
          <Text style={styles.placeholderLabel}>Trip stats bar goes here</Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 20,
    height: 1,
    width: '80%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    width: '100%',
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 36,
    marginBottom: 8,
  },
  placeholderLabel: {
    fontSize: 14,
    color: '#999',
  },
});
