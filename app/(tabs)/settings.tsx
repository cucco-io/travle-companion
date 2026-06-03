import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

/**
 * Settings Screen (Settings Tab)
 *
 * App-wide settings and preferences.
 *
 * TODO for implementer:
 * - Sections:
 *   1. Default Preferences
 *      - Default narration depth (brief / standard / deep_dive) — picker
 *      - Default interests (multi-select checkboxes)
 *      - Kid-friendly mode toggle
 *      - Default language picker
 *   2. Audio Settings
 *      - TTS voice preview & selection
 *      - Audio ducking mode (duck / pause / mix) — picker
 *      - Speaking rate slider (0.75x – 1.25x)
 *   3. API Keys (for development — remove in production)
 *      - Google Places API key input
 *      - Gemini API key input
 *      - TTS API key input
 *   4. Storage
 *      - Total cache size display
 *      - "Clear All Cached Audio" button
 *      - "Delete All Trips" button (with confirmation)
 *   5. About
 *      - App version
 *      - Open source licenses
 *      - Privacy policy link
 *
 * Data persistence:
 * - Use AsyncStorage for simple key-value preferences
 * - Or use expo-secure-store for API keys
 */
export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Text style={styles.description}>
        Configure your travel companion experience.
      </Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>⚙️</Text>
        <Text style={styles.placeholderLabel}>Settings controls go here</Text>
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
