import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

/**
 * Trips Screen (Trip History Tab)
 *
 * Displays the user's trip history — past, active, and prepared trips.
 *
 * TODO for implementer:
 * - FlatList of Trip cards sorted by created_at (newest first)
 * - Each card shows: trip name, destination, status badge, date, POI count
 * - Status badges: 'Preparing' (yellow), 'Ready' (blue), 'Active' (green), 'Completed' (gray)
 * - Tap a trip card to navigate:
 *   - 'preparing' → trip/prepare.tsx (resume preparation)
 *   - 'ready' → trip/active.tsx (start the trip)
 *   - 'active' → trip/active.tsx (resume the trip)
 *   - 'completed' → trip/review.tsx (view trip summary)
 * - Swipe-to-delete with confirmation dialog
 * - Empty state: "No trips yet — start exploring!"
 * - Pull-to-refresh
 *
 * Data source:
 * - src/services/storage/tripStorage.ts → listTrips()
 */
export default function TripsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Trips</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Text style={styles.description}>
        Your trip history will appear here.
      </Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>🗺️</Text>
        <Text style={styles.placeholderLabel}>Trip list goes here</Text>
      </View>
    </View>
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
  description: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 30,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    width: '100%',
  },
  placeholderText: {
    fontSize: 48,
    marginBottom: 12,
  },
  placeholderLabel: {
    fontSize: 14,
    color: '#999',
  },
});
