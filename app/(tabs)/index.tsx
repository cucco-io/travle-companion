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
 * - iOS-native themed UI with SF Symbols and smooth animations
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { getAllTrips } from '@/src/services/storage/tripStorage';
import { Trip } from '@/src/types/trip';
import { fetchPlaceSuggestions } from '@/src/services/api/placesService';
import { PlaceSuggestion } from '@/src/types/poi';
import { useAppTheme } from '@/src/theme/ThemeContext';
import { SegmentedControl, PrimaryButton, Badge } from '@/src/theme/UIComponents';
import { Icons } from '@/src/theme/icons';
import { Typography, Spacing, Radius } from '@/src/theme/theme';

// ─── Mode type ────────────────────────────────────────────────────────────────
type TripMode = 'city' | 'route';

// ─── Status icon helper ──────────────────────────────────────────────────────
function getStatusIcon(status: Trip['status']) {
  switch (status) {
    case 'ready':
      return { icon: Icons.checkmarkCircle, color: '#34C759' };
    case 'active':
      return { icon: Icons.trips, color: '#007AFF' };
    case 'completed':
      return { icon: Icons.trophy, color: '#FF9500' };
    default:
      return { icon: Icons.clock, color: '#8E8E93' };
  }
}

// ─── Trip Card Component ──────────────────────────────────────────────────────
function TripCard({ trip }: { trip: Trip }) {
  const { colors } = useAppTheme();
  const isReady = trip.status === 'ready';
  const isActive = trip.status === 'active';
  const date = new Date(trip.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const { icon: statusIcon, color: statusColor } = getStatusIcon(trip.status);

  return (
    <View
      style={[
        styles.tripCard,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
        },
      ]}
    >
      <View
        style={[
          styles.tripCardLeft,
          { backgroundColor: colors.fillTertiary },
        ]}
      >
        <SymbolView name={statusIcon} tintColor={statusColor} size={20} />
      </View>
      <View style={styles.tripCardContent}>
        <Text
          style={[Typography.subheadline, { fontWeight: '600', color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {trip.name}
        </Text>
        <Text
          style={[Typography.footnote, { color: colors.textSecondary, marginTop: 1 }]}
          numberOfLines={1}
        >
          {trip.destination.name}
        </Text>
        <View style={styles.tripCardMeta}>
          <Text style={[Typography.caption1, { color: colors.textTertiary }]}>
            {date}
          </Text>
          <Text
            style={[
              Typography.caption1,
              { color: colors.tint, fontWeight: '600' },
            ]}
          >
            {trip.mode === 'city' ? 'City' : 'Route'}
          </Text>
        </View>
      </View>
      <View style={styles.tripCardRight}>
        {isReady && (
          <Badge
            label={'Offline\nReady'}
            color={colors.backgroundElevated}
            backgroundColor={colors.success}
          />
        )}
        {isActive && (
          <Badge
            label="Active"
            color={colors.backgroundElevated}
            backgroundColor={colors.tint}
          />
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ExploreScreen() {
  const router = useRouter();
  const { colors, colorScheme } = useAppTheme();

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

    setSuggestions([]);
    setActiveInput(null);
  };

  const renderSuggestions = (type: 'destination' | 'routeOrigin' | 'routeDestination') => {
    if (activeInput !== type || suggestions.length === 0) {
      return null;
    }

    return (
      <View
        style={[
          styles.suggestionsDropdown,
          {
            backgroundColor: colors.backgroundElevated,
            borderColor: colors.cardBorder,
          },
        ]}
      >
        <ScrollView style={styles.suggestionsScroll} keyboardShouldPersistTaps="handled">
          {suggestions.map((item) => (
            <TouchableOpacity
              key={item.placeId}
              style={[
                styles.suggestionItem,
                { borderBottomColor: colors.separator },
              ]}
              onPress={() => handleSelectSuggestion(item)}
              activeOpacity={0.7}
            >
              <Text style={[Typography.subheadline, { fontWeight: '500', color: colors.textPrimary }]}>
                {item.mainText}
              </Text>
              <Text
                style={[Typography.caption1, { color: colors.textSecondary, marginTop: 1 }]}
                numberOfLines={1}
              >
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

    loadSavedTrips();

    return () => {
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
    outputRange: [0, 160],
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

  // ─── Shared input styles (dependent on theme) ─────────────────────────
  const inputWrapperStyle = [
    styles.inputWrapper,
    {
      backgroundColor: colors.fillTertiary,
      borderColor: colors.separator,
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

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
          <Text style={[Typography.largeTitle, { color: colors.textPrimary }]}>
            Explore
          </Text>
          <Text
            style={[
              Typography.subheadline,
              { color: colors.textSecondary, marginTop: Spacing.xs },
            ]}
          >
            Where will your story take you today?
          </Text>
        </Animated.View>

        {/* ── Search Card ──────────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Mode toggle — SegmentedControl */}
          <SegmentedControl
            segments={['City', 'Route']}
            selectedIndex={mode === 'city' ? 0 : 1}
            onSelect={(index) => setMode(index === 0 ? 'city' : 'route')}
            style={{ marginBottom: Spacing.base }}
          />

          {/* City mode — single destination */}
          <Animated.View style={{ opacity: cityInputOpacity, zIndex: activeInput === 'destination' ? 100 : 1 }}>
            {mode === 'city' && (
              <View style={[styles.inputGroup, { zIndex: activeInput === 'destination' ? 100 : 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  Destination
                </Text>
                <View style={inputWrapperStyle}>
                  <SymbolView
                    name={Icons.mappin}
                    tintColor={colors.tint}
                    size={16}
                    style={{ marginRight: Spacing.sm }}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    placeholder="City name or address..."
                    placeholderTextColor={colors.textTertiary}
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
                    selectionColor={colors.tint}
                  />
                  {loadingSuggestions && activeInput === 'destination' && (
                    <ActivityIndicator size="small" color={colors.tint} style={styles.inputLoading} />
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
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Starting Point
                  </Text>
                  <View style={inputWrapperStyle}>
                    <SymbolView
                      name={Icons.location}
                      tintColor={colors.tint}
                      size={16}
                      style={{ marginRight: Spacing.sm }}
                    />
                    <TextInput
                      style={[styles.input, { color: colors.textPrimary }]}
                      placeholder="Where are you starting?"
                      placeholderTextColor={colors.textTertiary}
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
                      selectionColor={colors.tint}
                    />
                    {loadingSuggestions && activeInput === 'routeOrigin' && (
                      <ActivityIndicator size="small" color={colors.tint} style={styles.inputLoading} />
                    )}
                  </View>
                  {renderSuggestions('routeOrigin')}
                </View>
                <View style={[styles.inputGroup, { zIndex: activeInput === 'routeDestination' ? 100 : 1 }]}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Destination
                  </Text>
                  <View style={inputWrapperStyle}>
                    <SymbolView
                      name={Icons.mappin}
                      tintColor={colors.destructive}
                      size={16}
                      style={{ marginRight: Spacing.sm }}
                    />
                    <TextInput
                      style={[styles.input, { color: colors.textPrimary }]}
                      placeholder="Where are you headed?"
                      placeholderTextColor={colors.textTertiary}
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
                      selectionColor={colors.tint}
                    />
                    {loadingSuggestions && activeInput === 'routeDestination' && (
                      <ActivityIndicator size="small" color={colors.tint} style={styles.inputLoading} />
                    )}
                  </View>
                  {renderSuggestions('routeDestination')}
                </View>
              </>
            )}
          </Animated.View>

          {/* Optional trip name */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Trip Name (optional)
            </Text>
            <View style={inputWrapperStyle}>
              <SymbolView
                name={Icons.pencil}
                tintColor={colors.textSecondary}
                size={16}
                style={{ marginRight: Spacing.sm }}
              />
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder="Give your trip a name..."
                placeholderTextColor={colors.textTertiary}
                value={tripName}
                onChangeText={setTripName}
                returnKeyType="done"
                selectionColor={colors.tint}
              />
            </View>
          </View>

          {/* Error */}
          {!!formError && (
            <Text style={[Typography.footnote, { color: colors.destructive, marginBottom: Spacing.md, marginTop: -Spacing.xs }]}>
              {formError}
            </Text>
          )}

          {/* Start Planning button */}
          <PrimaryButton
            title="Start Planning"
            onPress={handleStartPlanning}
            style={{ marginTop: Spacing.xs }}
          />
        </Animated.View>

        {/* ── Saved Trips ──────────────────────────────────────────────── */}
        <Animated.View style={{ opacity: fadeAnim }}>
          <View style={styles.sectionHeader}>
            <Text style={[Typography.title3, { color: colors.textPrimary }]}>
              Your Trips
            </Text>
            {loadingTrips && (
              <ActivityIndicator size="small" color={colors.tint} />
            )}
          </View>

          {!loadingTrips && savedTrips.length === 0 && (
            <View
              style={[
                styles.emptyState,
                {
                  backgroundColor: colors.cardBackground,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <SymbolView
                name={Icons.trips}
                tintColor={colors.textTertiary}
                size={40}
                style={{ marginBottom: Spacing.md }}
              />
              <Text
                style={[
                  Typography.headline,
                  { color: colors.textSecondary, marginBottom: Spacing.xs },
                ]}
              >
                No trips yet.
              </Text>
              <Text style={[Typography.subheadline, { color: colors.textTertiary }]}>
                Plan your first adventure above!
              </Text>
            </View>
          )}

          {!loadingTrips && savedTrips.map((t) => (
            <TripCard key={t.id} trip={t} />
          ))}
        </Animated.View>

        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },

  // Header — iOS large title style
  header: {
    marginBottom: Spacing.xl,
  },

  // Card
  card: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },

  // Input
  inputGroup: {
    marginBottom: Spacing.md + 2,
  },
  inputLabel: {
    ...Typography.caption1,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: Spacing.sm - 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  input: {
    flex: 1,
    ...Typography.body,
    height: 44,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Trip card
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tripCardLeft: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  tripCardContent: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  tripCardMeta: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 3,
  },
  tripCardRight: {
    alignItems: 'flex-end',
  },

  // Autocomplete suggestions
  suggestionsDropdown: {
    position: 'absolute',
    top: 68,
    left: 0,
    right: 0,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: 200,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  suggestionsScroll: {
    flex: 1,
  },
  suggestionItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputLoading: {
    marginLeft: Spacing.sm - 2,
  },
});
