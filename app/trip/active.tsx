/**
 * app/trip/active.tsx
 *
 * Active Travel Screen — shown during an in-progress trip.
 * Tracks GPS in real-time, triggers POI narrations by proximity,
 * slides up a POI card with playback controls, and logs breadcrumbs.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useProximityTrigger } from '@/src/hooks/useProximityTrigger';
import { useNarrationPlayer } from '@/src/hooks/useNarrationPlayer';
import {
  getTripById,
  updateTripStatus,
  addTripLogEntry,
  addBreadcrumb,
  saveLogEntries,
  saveBreadcrumbs,
} from '@/src/services/storage/tripStorage';
import { updatePOI } from '@/src/services/storage/tripStorage';
import type { Trip } from '@/src/types/trip';
import type { POI } from '@/src/types/poi';
import { SymbolView } from 'expo-symbols';

import { useAppTheme } from '@/src/theme/ThemeContext';
import {
  PrimaryButton,
  SecondaryButton,
  DestructiveButton,
  Badge,
  Icon,
} from '@/src/theme/UIComponents';
import { Icons, getCategoryIcon } from '@/src/theme/icons';
import { Typography, Spacing, Radius } from '@/src/theme/theme';

function formatMinutes(mins: number): string {
  if (mins < 1) return '< 1 min';
  return `${Math.round(mins)} min`;
}

function formatDistance(meters: number | null): string {
  if (meters === null) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// ─── POI Card (slide-up) ──────────────────────────────────────────────────────
interface POICardProps {
  poi: POI;
  playbackStatus: string;
  isPaused: boolean;
  queueLength: number;
  onSkip: () => void;
  onPause: () => void;
  onResume: () => void;
  onBookmark: (poi: POI) => void;
  slideAnim: Animated.Value;
}

function POICard({
  poi,
  playbackStatus,
  isPaused,
  queueLength,
  onSkip,
  onPause,
  onResume,
  onBookmark,
  slideAnim,
}: POICardProps) {
  const { colors } = useAppTheme();
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [320, 0],
  });

  return (
    <Animated.View style={[styles.poiCard, { transform: [{ translateY }], backgroundColor: colors.backgroundElevated, borderColor: colors.cardBorder }]}>
      {/* Image */}
      {poi.image_url ? (
        <Image
          source={{ uri: poi.image_url }}
          style={styles.poiImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.poiImagePlaceholder, { backgroundColor: colors.fillTertiary }]}>
          <Icon name={getCategoryIcon(poi.category)} size={48} color={colors.textQuaternary} />
        </View>
      )}

      {/* Info row */}
      <View style={styles.poiInfo}>
        <View style={{ flex: 1 }}>
          <Text style={[Typography.title3, { color: colors.textPrimary }]} numberOfLines={1}>{poi.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <SymbolView name={getCategoryIcon(poi.category)} tintColor={colors.textSecondary} size={12} style={{ marginRight: 4 }} />
            <Text style={[Typography.footnote, { color: colors.textSecondary, textTransform: 'capitalize' }]}>
              {poi.category.replace(/_/g, ' ')} · Estimated: {formatMinutes(poi.estimated_listen_minutes)}
            </Text>
          </View>
        </View>
        {/* Bookmark */}
        <TouchableOpacity
          onPress={() => onBookmark(poi)}
          style={styles.bookmarkBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <SymbolView
            name={poi.bookmarked ? Icons.bookmarkFilled : Icons.bookmark}
            tintColor={poi.bookmarked ? colors.warning : colors.textSecondary}
            size={22}
          />
        </TouchableOpacity>
      </View>

      {/* Controls */}
      <View style={styles.controlRow}>
        <TouchableOpacity style={[styles.skipBtn, { backgroundColor: colors.fillSecondary }]} onPress={onSkip}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <SymbolView name={Icons.skipForward} tintColor={colors.textPrimary} size={16} style={{ marginRight: 6 }} />
            <Text style={[Typography.headline, { color: colors.textPrimary }]}>Skip</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.playPauseBtn, { backgroundColor: colors.tint }]}
          onPress={isPaused ? onResume : onPause}
        >
          {playbackStatus === 'loading' ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <SymbolView name={isPaused ? Icons.play : Icons.pause} tintColor="#FFFFFF" size={20} />
          )}
        </TouchableOpacity>
      </View>

      {/* Queue indicator */}
      {queueLength > 0 && (
        <View style={[styles.queueRow, { backgroundColor: colors.fillTertiary }]}>
          <Text style={[Typography.caption2, { color: colors.tint, textAlign: 'center' }]}>
            {queueLength} more POI{queueLength !== 1 ? 's' : ''} coming up
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function TripActiveScreen() {
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = params.tripId ?? '';
  const { colors, colorScheme } = useAppTheme();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const startTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const prevCurrentPOIRef = useRef<POI | null>(null);

  // Load trip
  useEffect(() => {
    async function load() {
      try {
        if (!tripId) {
          setLoading(false);
          return;
        }
        const t = await getTripById(tripId);
        setTrip(t);
        if (t) {
          await updateTripStatus(tripId, 'active');
          const bookmarked = new Set<string>(
            t.pois.filter((p) => p.bookmarked).map((p) => p.id)
          );
          setBookmarkedIds(bookmarked);
        }
      } catch (e) {
        Alert.alert('Error', 'Could not load trip data.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tripId]);

  // Elapsed timer
  useEffect(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const pois = trip?.pois ?? [];
  const tripMode = trip?.mode ?? 'city';

  const proximity = useProximityTrigger(pois, tripMode, tripId || undefined);
  const narration = useNarrationPlayer();

  // Start proximity engine when trip is loaded
  const startedRef = useRef(false);
  useEffect(() => {
    if (!trip || startedRef.current) return;
    startedRef.current = true;
    proximity.start().catch((err) => {
      Alert.alert('GPS Error', err?.message ?? 'Could not start GPS tracking.');
    });
  }, [trip]);

  // Slide POI card in/out when currentPOI changes
  useEffect(() => {
    const curr = narration.currentPOI;
    if (curr && curr !== prevCurrentPOIRef.current) {
      prevCurrentPOIRef.current = curr;
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }).start();

      // Log narration trigger
      if (tripId) {
        addTripLogEntry(tripId, {
          poi_id: curr.id,
          played_at: new Date().toISOString(),
          location: proximity.nextPOI
            ? proximity.nextPOI.coordinates
            : { lat: 0, lng: 0 },
          skipped: false,
        }).catch(() => {});
      }
    } else if (!curr && prevCurrentPOIRef.current) {
      prevCurrentPOIRef.current = null;
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [narration.currentPOI]);

  // Save breadcrumbs periodically
  const breadcrumbFlushRef = useRef(0);
  useEffect(() => {
    if (!tripId) return;
    const interval = setInterval(() => {
      const crumbs = proximity.getBreadcrumbs();
      const newCrumbs = crumbs.slice(breadcrumbFlushRef.current);
      if (newCrumbs.length > 0) {
        breadcrumbFlushRef.current = crumbs.length;
        saveBreadcrumbs(tripId, newCrumbs).catch(() => {});
        // Also record individual breadcrumbs as they come in
        newCrumbs.forEach((c) => addBreadcrumb(tripId, c).catch(() => {}));
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [tripId]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSkip = useCallback(() => {
    narration.skip();
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [narration.skip]);

  const handlePause = useCallback(() => narration.pause(), [narration.pause]);
  const handleResume = useCallback(() => narration.resume(), [narration.resume]);

  const handleBookmark = useCallback(
    async (poi: POI) => {
      try {
        const newVal = !poi.bookmarked;
        const updatedPoi: POI = { ...poi, bookmarked: newVal };
        await updatePOI(updatedPoi);
        setBookmarkedIds((prev) => {
          const next = new Set(prev);
          if (newVal) next.add(poi.id);
          else next.delete(poi.id);
          return next;
        });
        // Update local trip pois
        setTrip((t) =>
          t
            ? {
                ...t,
                pois: t.pois.map((p) =>
                  p.id === poi.id ? { ...p, bookmarked: newVal } : p
                ),
              }
            : t
        );
      } catch {
        Alert.alert('Error', 'Could not update bookmark.');
      }
    },
    []
  );

  const handleEndTrip = useCallback(() => {
    Alert.alert(
      'End Trip?',
      'Are you sure you want to end this trip? Your progress will be saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Trip',
          style: 'destructive',
          onPress: async () => {
            try {
              proximity.stop();
              narration.stop();

              if (tripId) {
                // Flush remaining log entries & breadcrumbs
                const log = proximity.getLog();
                const crumbs = proximity.getBreadcrumbs();
                await saveLogEntries(tripId, log).catch(() => {});
                await saveBreadcrumbs(tripId, crumbs).catch(() => {});
                await updateTripStatus(tripId, 'completed');
              }

              router.replace(`/trip/review?tripId=${tripId}`);
            } catch {
              Alert.alert('Error', 'Could not end the trip. Please try again.');
            }
          },
        },
      ]
    );
  }, [tripId, proximity, narration]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const elapsed = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const totalPOIs = pois.length;
  const playedCount = proximity.playedCount;

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Active Trip', headerBackVisible: false }} />
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.base }]}>Loading trip…</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Active Trip', headerBackVisible: false }} />
        <Text style={[Typography.body, { color: colors.destructive, marginBottom: Spacing.xl }]}>Trip not found.</Text>
        <SecondaryButton title="Go Back" onPress={() => router.back()} />
      </View>
    );
  }

  const currentPOI = narration.currentPOI;
  const currentPOIWithBookmark: POI | null = currentPOI
    ? { ...currentPOI, bookmarked: bookmarkedIds.has(currentPOI.id) }
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <Stack.Screen options={{ title: 'Active Trip', headerBackVisible: false }} />

      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.separator }]}>
        <View style={{ flex: 1, marginRight: Spacing.md }}>
          <Text style={[Typography.headline, { color: colors.textPrimary }]} numberOfLines={1}>{trip.name}</Text>
          <Text style={[Typography.footnote, { color: colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>{trip.destination.name}</Text>
        </View>
        <TouchableOpacity style={[styles.endBtn, { backgroundColor: colors.destructive + '15' }]} onPress={handleEndTrip}>
          <Text style={[Typography.subheadline, { color: colors.destructive, fontWeight: '600' }]}>End Trip</Text>
        </TouchableOpacity>
      </View>

      {/* ── Location display ───────────────────────────────────────────── */}
      <View style={[styles.locationPanel, { backgroundColor: colors.fillTertiary, borderBottomColor: colors.separator }]}>
        <View style={[styles.locationDot, { backgroundColor: proximity.isActive ? colors.success : colors.warning }]} />
        <Text style={[Typography.subheadline, { color: colors.textPrimary, fontWeight: '600', flex: 1 }]}>
          {proximity.isActive ? 'GPS Tracking Active' : 'Starting GPS…'}
          {proximity.isActive && !!proximity.nextPOI && (
            <Text style={{ fontWeight: '400', color: colors.textSecondary }}>
              {' '}— next POI in {formatDistance(proximity.distanceToNextPOI)}
            </Text>
          )}
        </Text>
      </View>

      {/* ── POI list (fallback / overview) ────────────────────────────── */}
      <View style={styles.poiListWrapper}>
        <Text style={[Typography.caption2, { color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm }]}>
          Points of Interest · {proximity.remainingPOICount} remaining
        </Text>
        <ScrollView
          style={styles.poiScroll}
          showsVerticalScrollIndicator={false}
        >
          {pois.map((poi) => {
            const isPlayed = proximity.playedCount > 0 && poi.played_at != null;
            const isCurrent = currentPOI?.id === poi.id;
            const distanceArrow =
              proximity.nextPOI?.id === poi.id &&
              proximity.isActive &&
              proximity.distanceToNextPOI !== null
                ? ` ${formatDistance(proximity.distanceToNextPOI)}`
                : '';

            return (
              <View
                key={poi.id}
                style={[
                  styles.poiListItem,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: isCurrent ? colors.tint : colors.cardBorder,
                  },
                  isCurrent && { borderWidth: 1.5 },
                ]}
              >
                <View style={[styles.poiIconContainer, { backgroundColor: colors.fillTertiary }]}>
                  <Icon name={getCategoryIcon(poi.category)} size={18} color={isCurrent ? colors.tint : colors.textSecondary} />
                </View>
                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                  <Text
                    style={[
                      Typography.subheadline,
                      { fontWeight: '600', color: isCurrent ? colors.tint : colors.textPrimary },
                      isPlayed && { color: colors.textTertiary, textDecorationLine: 'line-through' },
                    ]}
                    numberOfLines={1}
                  >
                    {poi.name}
                    {distanceArrow ? (
                      <Text style={{ color: colors.tint, fontWeight: '500' }}>{distanceArrow}</Text>
                    ) : null}
                  </Text>
                  <Text style={[Typography.caption2, { color: colors.textSecondary, marginTop: 2 }]}>
                    {formatMinutes(poi.estimated_listen_minutes)}
                    {bookmarkedIds.has(poi.id) ? ' · ★ bookmarked' : ''}
                  </Text>
                </View>
                <SymbolView
                  name={isCurrent ? Icons.play : isPlayed ? Icons.checkmarkCircle : Icons.circle}
                  tintColor={isCurrent ? colors.tint : isPlayed ? colors.success : colors.textQuaternary}
                  size={18}
                />
              </View>
            );
          })}

          {pois.length === 0 && (
            <View style={styles.noPoisBox}>
              <Text style={[Typography.body, { color: colors.textSecondary }]}>No POIs found for this trip.</Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* ── Stats bar ─────────────────────────────────────────────────── */}
      <View style={[styles.statsBar, { backgroundColor: colors.backgroundElevated, borderTopColor: colors.separator }]}>
        <View style={styles.statItem}>
          <Text style={[Typography.headline, { color: colors.tint, fontWeight: '700' }]}>{playedCount}/{totalPOIs}</Text>
          <Text style={[Typography.caption2, { color: colors.textSecondary, marginTop: 2, textTransform: 'uppercase' }]}>POIs</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
        <View style={styles.statItem}>
          <Text style={[Typography.headline, { color: colors.textPrimary, fontWeight: '700' }]}>{elapsed}</Text>
          <Text style={[Typography.caption2, { color: colors.textSecondary, marginTop: 2, textTransform: 'uppercase' }]}>Elapsed</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
        <View style={styles.statItem}>
          <Text style={[Typography.headline, { color: colors.textPrimary, fontWeight: '700' }]}>{proximity.remainingPOICount}</Text>
          <Text style={[Typography.caption2, { color: colors.textSecondary, marginTop: 2, textTransform: 'uppercase' }]}>Remaining</Text>
        </View>
      </View>

      {/* ── Sliding POI card ──────────────────────────────────────────── */}
      {currentPOIWithBookmark && (
        <POICard
          poi={currentPOIWithBookmark}
          playbackStatus={narration.playbackStatus}
          isPaused={narration.isPaused}
          queueLength={narration.queueLength}
          onSkip={handleSkip}
          onPause={handlePause}
          onResume={handleResume}
          onBookmark={handleBookmark}
          slideAnim={slideAnim}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  endBtn: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  // ── Location panel
  locationPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  locationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  // ── POI list
  poiListWrapper: {
    flex: 1,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
  },
  poiScroll: {
    flex: 1,
  },
  poiListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  poiIconContainer: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.base,
  },
  noPoisBox: {
    alignItems: 'center',
    padding: Spacing.xl * 2,
  },
  // ── Stats bar
  statsBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  // ── POI card (slide-up)
  poiCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 16,
  },
  poiImage: {
    width: '100%',
    height: 150,
  },
  poiImagePlaceholder: {
    width: '100%',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poiInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.base,
  },
  bookmarkBtn: {
    paddingLeft: Spacing.md,
    paddingTop: 2,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base + Spacing.sm,
    gap: Spacing.base,
  },
  skipBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  playPauseBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  queueRow: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
});
