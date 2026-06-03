import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';

import { Text, View } from '@/components/Themed';

/**
 * Trip Preparation Screen
 *
 * Shown when the user is setting up a new trip and during the preparation pipeline.
 *
 * This screen has two phases:
 *
 * Phase 1: Configuration (user input)
 * TODO for implementer:
 * - Trip name input field
 * - Destination display (passed from Explore screen via router params)
 * - Trip mode indicator (city or route)
 * - [Route mode only] Origin picker
 * - Preferences form:
 *   - Interest categories (multi-select: history, nature, architecture, food_culture, quirky)
 *   - Narration depth (brief / standard / deep_dive) — segmented control
 *   - Kid-friendly toggle
 *   - Language picker
 * - "Prepare Trip" button to start the pipeline
 *
 * Phase 2: Preparation Progress (automated pipeline)
 * TODO for implementer:
 * - Overall progress bar (0–100%)
 * - Current stage label (e.g., "Generating narrations... 12/25")
 * - Animated stage indicators (fetching → curating → narrating → synthesizing → caching)
 * - Cancel button
 * - Error state with retry option
 * - "Trip Ready!" success state with "Start Trip" button
 *
 * Hooks used:
 * - src/hooks/useTripPreparation.ts
 *
 * Navigation:
 * - "Start Trip" → app/trip/active.tsx
 * - Back/Cancel → app/(tabs)/index.tsx
 */
export default function TripPrepareScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Prepare Trip' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Prepare Your Trip</Text>
        <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
        <Text style={styles.description}>
          Configure your preferences and we'll prepare personalized narrations for your journey.
        </Text>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>📋</Text>
          <Text style={styles.placeholderLabel}>Trip configuration form goes here</Text>
        </View>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>⏳</Text>
          <Text style={styles.placeholderLabel}>Preparation progress indicator goes here</Text>
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
  description: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 30,
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
