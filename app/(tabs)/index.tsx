/**
 * app/(tabs)/index.tsx
 *
 * Explore Screen — the main entry point for starting new trips.
 *
 * Features:
 * - Destination search bar (city name or address)
 * - Toggle between City Mode and Route Mode
 * - Route Mode: two input fields (origin + destination)
 * - "Start Planning" button → navigates to prepare.tsx with params
 * - List of previously saved trips from tripStorage.getAllTrips()
 * - Beautiful travel-themed dark UI with smooth animations
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  ActivityIndicator,
  Platform,
  StatusBar,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getAllTrips } from '@/src/services/storage/tripStorage';
import { Trip } from '@/src/types/trip';
import { fetchPlaceSuggestions } from '@/src/services/api/placesService';
import { PlaceSuggestion } from '@/src/types/poi';

// ─── Design tokens ──────────────────────────────────────────────────────────
const COLORS = {
  navy: '#0A1628',
  navyLight: '#122040',
  navyMid: '#1A2E4A',
  gold: '#F5A623',
  goldLight: '#FFD166',
  teal: '#06B6D4',
  tealDark: '#0891B2',
  white: '#FFFFFF',
  whiteAlpha80: 'rgba(255,255,255,0.8)',
  whiteAlpha50: 'rgba(255,255,255,0.5)',
  whiteAlpha20: 'rgba(255,255,255,0.2)',
  whiteAlpha10: 'rgba(255,255,255,0.1)',
  whiteAlpha05: 'rgba(255,255,255,0.05)',
  error: '#FF6B6B',
  success: '#10B981',
  green: '#34D399',
} as const;

// ─── Mode type ────────────────────────────────────────────────────────────────
type TripMode = 'city' | 'route';

// ─── Trip Card Component ──────────────────────────────────────────────────────
function TripCard({ trip }: { trip: Trip }) {
  const isReady = trip.status === 'ready';
  const isActive = trip.status === 'active';
  const date = new Date(trip.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const statusEmoji =
    trip.status === 'ready' ? '✅' :
    trip.status === 'active' ? '🗺️' :
    trip.status === 'completed' ? '🏆' : '⏳';

  return (
    <View style={styles.tripCard}>
      <View style={styles.tripCardLeft}>
        <Text style={styles.tripCardEmoji}>{statusEmoji}</Text>
      </View>
      <View style={styles.tripCardContent}>
        <Text style={styles.tripCardName} numberOfLines={1}>{trip.name}</Text>
        <Text style={styles.tripCardDest} numberOfLines={1}>
          {trip.destination.name}
        </Text>
        <View style={styles.tripCardMeta}>
          <Text style={styles.tripCardDate}>{date}</Text>
          <Text style={styles.tripCardMode}>
            {trip.mode === 'city' ? '🏙 City' : '🛣 Route'}
          </Text>
        </View>
      </View>
      <View style={styles.tripCardRight}>
        {isReady && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineBadgeText}>Offline{'\n'}Ready</Text>
          </View>
        )}
        {isActive && (
          <View style={[styles.offlineBadge, styles.activeBadge]}>
            <Text style={styles.offlineBadgeText}>Active</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ExploreScreen() {
  const router = useRouter();

  // Mode state
  const [mode, setMode] = useState<TripMode>('city');

  // City mode: single destination
  const [destination, setDestination] = useState('');

  // Route mode: origin + destination
  const [routeOrigin, setRouteOrigin] = useState('');
  const [routeDestination, setRouteDestination] = useState('');

  // Trip name (auto-generated but editable)
  const [tripName, setTripName] = useState('');

  // Saved trips
  const [savedTrips, setSavedTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);

  // Error
  const [formError, setFormError] = useState('');

  // Autocomplete suggestions state
  const [activeInput, setActiveInput] = useState<'destination' | 'routeOrigin' | 'routeDestination' | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const routeModeAnim = useRef(new Animated.Value(0)).current;
  const headerPulse = useRef(new Animated.Value(1)).current;

  // ── Autocomplete Logic ──────────────────────────────────────────────────
  const performSearch = useCallback(async (text: string, type: 'destination' | 'routeOrigin' | 'routeDestination') => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!text.trim() || text.trim().length < 2) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    setLoadingSuggestions(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await fetchPlaceSuggestions(text);
        // Only update state if this input is still active
        setSuggestions(results);
      } catch (err) {
        console.warn('Autocomplete search failed:', err);
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 300);
  }, []);

  const handleDestinationChange = (text: string) => {
    setDestination(text);
    setActiveInput('destination');
    performSearch(text, 'destination');
  };

  const handleOriginChange = (text: string) => {
    setRouteOrigin(text);
    setActiveInput('routeOrigin');
    performSearch(text, 'routeOrigin');
  };

  const handleRouteDestinationChange = (text: string) => {
    setRouteDestination(text);
    setActiveInput('routeDestination');
    performSearch(text, 'routeDestination');
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    const value = suggestion.description || suggestion.mainText;
    
    if (activeInput === 'destination') {
      setDestination(value);
    } else if (activeInput === 'routeOrigin') {
      setRouteOrigin(value);
    } else if (activeInput === 'routeDestination') {
      setRouteDestination(value);
    }

    // Reset autocomplete state
    setSuggestions([]);
    setActiveInput(null);
  };

  const renderSuggestions = (type: 'destination' | 'routeOrigin' | 'routeDestination') => {
    if (activeInput !== type || suggestions.length === 0) {
      return null;
    }

    return (
      <View style={styles.suggestionsDropdown}>
        <ScrollView style={styles.suggestionsScroll} keyboardShouldPersistTaps="handled">
          {suggestions.map((item) => (
            <TouchableOpacity
              key={item.placeId}
              style={styles.suggestionItem}
              onPress={() => handleSelectSuggestion(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.suggestionMain}>{item.mainText}</Text>
              <Text style={styles.suggestionSub} numberOfLines={1}>
                {item.description}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  // ── On mount: fade in + load trips ──────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle pulsing on the compass emoji
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(headerPulse, {
          toValue: 1.08,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(headerPulse, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnim.start();

    loadSavedTrips();

    return () => {
      pulseAnim.stop();
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // ── Toggle mode animation ─────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(routeModeAnim, {
      toValue: mode === 'route' ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [mode]);

  const routeInputHeight = routeModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 110],
  });

  const cityInputOpacity = routeModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const routeInputOpacity = routeModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  // ── Load saved trips ────────────────────────────────────────────────────
  const loadSavedTrips = useCallback(async () => {
    try {
      setLoadingTrips(true);
      const trips = await getAllTrips();
      setSavedTrips(trips);
    } catch (err) {
      console.warn('Failed to load saved trips:', err);
      setSavedTrips([]);
    } finally {
      setLoadingTrips(false);
    }
  }, []);

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleStartPlanning = useCallback(() => {
    setFormError('');

    if (mode === 'city') {
      if (!destination.trim()) {
        setFormError('Please enter a destination city or address.');
        return;
      }
      const name = tripName.trim() || `Explore ${destination.trim()}`;
      router.push({
        pathname: '/trip/prepare',
        params: {
          mode: 'city',
          destinationName: destination.trim(),
          tripName: name,
        },
      });
    } else {
      if (!routeOrigin.trim()) {
        setFormError('Please enter your starting point.');
        return;
      }
      if (!routeDestination.trim()) {
        setFormError('Please enter your destination.');
        return;
      }
      const name = tripName.trim() || `${routeOrigin.trim()} → ${routeDestination.trim()}`;
      router.push({
        pathname: '/trip/prepare',
        params: {
          mode: 'route',
          originName: routeOrigin.trim(),
          destinationName: routeDestination.trim(),
          tripName: name,
        },
      });
    }
  }, [mode, destination, routeOrigin, routeDestination, tripName, router]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />

      {/* Decorative background circles */}
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.header,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Animated.Text
            style={[styles.headerEmoji, { transform: [{ scale: headerPulse }] }]}
          >
            🧭
          </Animated.Text>
          <Text style={styles.headerTitle}>Explore</Text>
          <Text style={styles.headerSubtitle}>
            Where will your story take you today?
          </Text>
        </Animated.View>

        {/* ── Search Card ──────────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.card,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Mode toggle */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeChip, mode === 'city' && styles.modeChipActive]}
              onPress={() => setMode('city')}
              activeOpacity={0.7}
            >
              <Text style={[styles.modeChipText, mode === 'city' && styles.modeChipTextActive]}>
                🏙 City Mode
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeChip, mode === 'route' && styles.modeChipActive]}
              onPress={() => setMode('route')}
              activeOpacity={0.7}
            >
              <Text style={[styles.modeChipText, mode === 'route' && styles.modeChipTextActive]}>
                🛣 Route Mode
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modeDivider} />

          {/* City mode — single destination */}
          <Animated.View style={{ opacity: cityInputOpacity, zIndex: activeInput === 'destination' ? 100 : 1 }}>
            {mode === 'city' && (
              <View style={[styles.inputGroup, { zIndex: activeInput === 'destination' ? 100 : 1 }]}>
                <Text style={styles.inputLabel}>Destination</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputIcon}>📍</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="City name or address..."
                    placeholderTextColor={COLORS.whiteAlpha50}
                    value={destination}
                    onChangeText={handleDestinationChange}
                    onFocus={() => {
                      setActiveInput('destination');
                      if (destination.trim().length >= 2) performSearch(destination, 'destination');
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setActiveInput(curr => curr === 'destination' ? null : curr);
                      }, 200);
                    }}
                    returnKeyType="done"
                    autoCorrect={false}
                    selectionColor={COLORS.gold}
                  />
                  {loadingSuggestions && activeInput === 'destination' && (
                    <ActivityIndicator size="small" color={COLORS.gold} style={styles.inputLoading} />
                  )}
                </View>
                {renderSuggestions('destination')}
              </View>
            )}
          </Animated.View>

          {/* Route mode — origin + destination */}
          <Animated.View
            style={{
              opacity: routeInputOpacity,
              height: routeInputHeight,
              overflow: mode === 'route' ? 'visible' : 'hidden',
              zIndex: activeInput ? 100 : 1,
            }}
          >
            {mode === 'route' && (
              <>
                <View style={[styles.inputGroup, { zIndex: activeInput === 'routeOrigin' ? 100 : 2 }]}>
                  <Text style={styles.inputLabel}>Starting Point</Text>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputIcon}>🔵</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Where are you starting?"
                      placeholderTextColor={COLORS.whiteAlpha50}
                      value={routeOrigin}
                      onChangeText={handleOriginChange}
                      onFocus={() => {
                        setActiveInput('routeOrigin');
                        if (routeOrigin.trim().length >= 2) performSearch(routeOrigin, 'routeOrigin');
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setActiveInput(curr => curr === 'routeOrigin' ? null : curr);
                        }, 200);
                      }}
                      returnKeyType="next"
                      autoCorrect={false}
                      selectionColor={COLORS.gold}
                    />
                    {loadingSuggestions && activeInput === 'routeOrigin' && (
                      <ActivityIndicator size="small" color={COLORS.gold} style={styles.inputLoading} />
                    )}
                  </View>
                  {renderSuggestions('routeOrigin')}
                </View>
                <View style={[styles.inputGroup, { zIndex: activeInput === 'routeDestination' ? 100 : 1 }]}>
                  <Text style={styles.inputLabel}>Destination</Text>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.inputIcon}>🔴</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Where are you headed?"
                      placeholderTextColor={COLORS.whiteAlpha50}
                      value={routeDestination}
                      onChangeText={handleRouteDestinationChange}
                      onFocus={() => {
                        setActiveInput('routeDestination');
                        if (routeDestination.trim().length >= 2) performSearch(routeDestination, 'routeDestination');
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setActiveInput(curr => curr === 'routeDestination' ? null : curr);
                        }, 200);
                      }}
                      returnKeyType="done"
                      autoCorrect={false}
                      selectionColor={COLORS.gold}
                    />
                    {loadingSuggestions && activeInput === 'routeDestination' && (
                      <ActivityIndicator size="small" color={COLORS.gold} style={styles.inputLoading} />
                    )}
                  </View>
                  {renderSuggestions('routeDestination')}
                </View>
              </>
            )}
          </Animated.View>

          {/* Optional trip name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Trip Name (optional)</Text>
            <View style={styles.inputWrapper}>
              <Text style={styles.inputIcon}>✏️</Text>
              <TextInput
                style={styles.input}
                placeholder="Give your trip a name..."
                placeholderTextColor={COLORS.whiteAlpha50}
                value={tripName}
                onChangeText={setTripName}
                returnKeyType="done"
                selectionColor={COLORS.gold}
              />
            </View>
          </View>

          {/* Error */}
          {!!formError && (
            <Text style={styles.errorText}>{formError}</Text>
          )}

          {/* Start Planning button */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleStartPlanning}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaButtonText}>Start Planning ✈️</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Saved Trips ──────────────────────────────────────────────── */}
        <Animated.View style={{ opacity: fadeAnim }}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Trips</Text>
            {loadingTrips && (
              <ActivityIndicator size="small" color={COLORS.gold} />
            )}
          </View>

          {!loadingTrips && savedTrips.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateEmoji}>🗺️</Text>
              <Text style={styles.emptyStateText}>No trips yet.</Text>
              <Text style={styles.emptyStateSubtext}>
                Plan your first adventure above!
              </Text>
            </View>
          )}

          {!loadingTrips && savedTrips.map((t) => (
            <TripCard key={t.id} trip={t} />
          ))}
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  bgCircle1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: COLORS.tealDark,
    opacity: 0.08,
    top: -80,
    right: -80,
  },
  bgCircle2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.gold,
    opacity: 0.06,
    top: 200,
    left: -60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  headerEmoji: {
    fontSize: 52,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 15,
    color: COLORS.whiteAlpha80,
    textAlign: 'center',
  },

  // Card
  card: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 20,
    padding: 20,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },

  // Mode toggle chips
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.whiteAlpha10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha20,
  },
  modeChipActive: {
    backgroundColor: COLORS.tealDark,
    borderColor: COLORS.teal,
  },
  modeChipText: {
    fontSize: 14,
    color: COLORS.whiteAlpha80,
    fontWeight: '600',
  },
  modeChipTextActive: {
    color: COLORS.white,
  },
  modeDivider: {
    height: 1,
    backgroundColor: COLORS.whiteAlpha10,
    marginBottom: 16,
  },

  // Input
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.teal,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.whiteAlpha05,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha20,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.white,
    height: 48,
  },

  // Error
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    marginBottom: 12,
    marginTop: -4,
  },

  // CTA Button
  ctaButton: {
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.navy,
    letterSpacing: 0.3,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: COLORS.whiteAlpha05,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
  },
  emptyStateEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.whiteAlpha80,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: COLORS.whiteAlpha50,
  },

  // Trip card
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.navyLight,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  tripCardLeft: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.whiteAlpha10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tripCardEmoji: {
    fontSize: 22,
  },
  tripCardContent: {
    flex: 1,
    marginRight: 8,
  },
  tripCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 2,
  },
  tripCardDest: {
    fontSize: 13,
    color: COLORS.whiteAlpha80,
    marginBottom: 4,
  },
  tripCardMeta: {
    flexDirection: 'row',
    gap: 10,
  },
  tripCardDate: {
    fontSize: 12,
    color: COLORS.whiteAlpha50,
  },
  tripCardMode: {
    fontSize: 12,
    color: COLORS.teal,
    fontWeight: '600',
  },
  tripCardRight: {
    alignItems: 'flex-end',
  },
  offlineBadge: {
    backgroundColor: COLORS.green,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  activeBadge: {
    backgroundColor: COLORS.gold,
  },
  offlineBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.navy,
    textAlign: 'center',
    lineHeight: 14,
  },

  // Autocomplete suggestions styles
  suggestionsDropdown: {
    position: 'absolute',
    top: 72,
    left: 0,
    right: 0,
    backgroundColor: '#1E2E4A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.whiteAlpha20,
    maxHeight: 200,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  suggestionsScroll: {
    flex: 1,
  },
  suggestionItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  suggestionMain: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  suggestionSub: {
    fontSize: 11,
    color: COLORS.whiteAlpha50,
  },
  inputLoading: {
    marginLeft: 6,
  },
});
