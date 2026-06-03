import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';

import { Text, View } from '@/components/Themed';

/**
 * Post-Trip Review Screen
 *
 * Shown after a trip is completed. Displays a summary of the trip
 * with statistics, route visualization, and the ability to bookmark POIs.
 *
 * TODO for implementer:
 * - Trip header: name, destination, date range, duration
 * - Route map: full trip route with GPS breadcrumb trail and POI markers
 *   - Played POIs: green markers
 *   - Skipped POIs: gray markers
 *   - Bookmarked POIs: star icon
 * - Trip statistics:
 *   - Total POIs encountered
 *   - POIs played vs. skipped
 *   - Total listening time
 *   - Distance traveled
 *   - Trip duration
 * - POI list (scrollable):
 *   - Each POI card shows: name, category, play/skip status, timestamp
 *   - Tap to expand and read the narration text
 *   - Bookmark toggle button
 *   - "Replay" button (plays narration again)
 * - Action buttons:
 *   - "Share Trip" — generate a shareable trip summary
 *   - "Delete Trip" — with confirmation dialog
 *   - "Done" — return to Trips tab
 *
 * Data sources:
 * - src/services/storage/tripStorage.ts → getTripById(), getLogEntries()
 * - Trip breadcrumbs for route visualization
 *
 * Navigation:
 * - "Done" → app/(tabs)/trips.tsx
 */
export default function TripReviewScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Trip Review' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Trip Complete! 🎉</Text>
        <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>🗺️</Text>
          <Text style={styles.placeholderLabel}>Route map with POI markers goes here</Text>
        </View>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>📊</Text>
          <Text style={styles.placeholderLabel}>Trip statistics go here</Text>
        </View>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>📝</Text>
          <Text style={styles.placeholderLabel}>POI list with bookmark & replay goes here</Text>
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
