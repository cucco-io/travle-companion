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

// ─── Color palette ────────────────────────────────────────────────────────────
const COLORS = {
  bg: '#0a0e1a',
  surface: '#131929',
  card: '#1a2236',
  border: '#252f47',
  gold: '#f5c842',
  teal: '#2dd4bf',
  green: '#22c55e',
  red: '#ef4444',
  muted: '#6b7280',
  text: '#f1f5f9',
  textSub: '#94a3b8',
};

// ─── Category icons ────────────────────────────────────────────────────────────
function categoryIcon(cat: POI['category']): string {
  const map: Record<POI['category'], string> = {
    historical_landmark: '🏛️',
    museum: '🏛️',
    church: '⛪',
    park: '🌿',
    natural_landmark: '🏔️',
    monument: '🗿',
    cultural_site: '🎭',
    quirky: '🎪',
    other: '📍',
  };
  return map[cat] ?? '📍';
}

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
  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [320, 0],
  });

  return (
    <Animated.View style={[styles.poiCard, { transform: [{ translateY }] }]}>
      {/* Image */}
      {poi.image_url ? (
        <Image
          source={{ uri: poi.image_url }}
          style={styles.poiImage}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.poiImagePlaceholder}>
          <Text style={styles.poiImageIcon}>{categoryIcon(poi.category)}</Text>
        </View>
      )}

      {/* Info row */}
      <View style={styles.poiInfo}>
        <View style={{ flex: 1 }}>
          <Text style={styles.poiName} numberOfLines={2}>{poi.name}</Text>
          <Text style={styles.poiMeta}>
            {categoryIcon(poi.category)} {poi.category.replace(/_/g, ' ')} ·{' '}
            {formatMinutes(poi.estimated_listen_minutes)}
          </Text>
        </View>
        {/* Bookmark */}
        <TouchableOpacity
          onPress={() => onBookmark(poi)}
          style={styles.bookmarkBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.bookmarkIcon, poi.bookmarked && styles.bookmarkActive]}>
            {poi.bookmarked ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Controls */}
      <View style={styles.controlRow}>
        <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
          <Text style={styles.skipBtnText}>⏭ Skip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.playPauseBtn}
          onPress={isPaused ? onResume : onPause}
        >
          <Text style={styles.playPauseBtnText}>
            {playbackStatus === 'loading' ? '⏳' : isPaused ? '▶' : '⏸'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Queue indicator */}
      {queueLength > 0 && (
        <View style={styles.queueRow}>
          <Text style={styles.queueText}>
            🎵 {queueLength} more POI{queueLength !== 1 ? 's' : ''} coming up
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Direction helper ─────────────────────────────────────────────────────────
function bearing(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): string {
  const dLng = toLng - fromLng;
  const y = Math.sin(dLng) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const idx = Math.round(((brng + 360) % 360) / 45) % 8;
  return arrows[idx];
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function TripActiveScreen() {
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = params.tripId ?? '';

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
  // useNarrationPlayer is already used inside useProximityTrigger; expose via
  // the narration state it returns through the proximity hook's narration state.
  // We need our own narration hook for UI controls:
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
      <View style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: 'Active Trip', headerBackVisible: false }} />
        <Text style={styles.loadingText}>Loading trip…</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.container, styles.center]}>
        <Stack.Screen options={{ title: 'Active Trip', headerBackVisible: false }} />
        <Text style={styles.errorText}>Trip not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.btn}>
          <Text style={styles.btnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentPOI = narration.currentPOI;
  const currentPOIWithBookmark: POI | null = currentPOI
    ? { ...currentPOI, bookmarked: bookmarkedIds.has(currentPOI.id) }
    : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Stack.Screen options={{ title: 'Active Trip', headerBackVisible: false }} />

      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle} numberOfLines={1}>{trip.name}</Text>
          <Text style={styles.headerSub}>{trip.destination.name}</Text>
        </View>
        <TouchableOpacity style={styles.endBtn} onPress={handleEndTrip}>
          <Text style={styles.endBtnText}>End Trip</Text>
        </TouchableOpacity>
      </View>

      {/* ── Location display ───────────────────────────────────────────── */}
      <View style={styles.locationPanel}>
        <View style={styles.locationDot} />
        <Text style={styles.locationText}>
          {proximity.isActive ? 'GPS Active' : 'Starting GPS…'}
          {proximity.isActive && !!proximity.nextPOI && (
            <Text style={styles.locationSub}>
              {' '}— next POI in {formatDistance(proximity.distanceToNextPOI)}
            </Text>
          )}
        </Text>
      </View>

      {/* ── POI list (fallback / overview) ────────────────────────────── */}
      <View style={styles.poiListWrapper}>
        <Text style={styles.sectionTitle}>
          Points of Interest · {proximity.remainingPOICount} remaining
        </Text>
        <ScrollView
          style={styles.poiScroll}
          showsVerticalScrollIndicator={false}
        >
          {pois.map((poi) => {
            const isPlayed = proximity.playedCount > 0 && poi.played_at != null;
            const isSkipped = proximity.skippedCount > 0;
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
                  isCurrent && styles.poiListItemActive,
                ]}
              >
                <Text style={styles.poiListIcon}>{categoryIcon(poi.category)}</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.poiListName,
                      isPlayed && styles.poiListNamePlayed,
                    ]}
                    numberOfLines={1}
                  >
                    {poi.name}
                    {distanceArrow ? (
                      <Text style={styles.poiListDistance}>{distanceArrow}</Text>
                    ) : null}
                  </Text>
                  <Text style={styles.poiListMeta}>
                    {formatMinutes(poi.estimated_listen_minutes)}
                    {bookmarkedIds.has(poi.id) ? ' · ★' : ''}
                  </Text>
                </View>
                <Text style={styles.poiListStatus}>
                  {isCurrent
                    ? '▶'
                    : isPlayed
                    ? '✓'
                    : '○'}
                </Text>
              </View>
            );
          })}

          {pois.length === 0 && (
            <View style={styles.noPoisBox}>
              <Text style={styles.noPoisText}>No POIs found for this trip.</Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* ── Stats bar ─────────────────────────────────────────────────── */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{playedCount}/{totalPOIs}</Text>
          <Text style={styles.statLabel}>POIs</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{elapsed}</Text>
          <Text style={styles.statLabel}>Elapsed</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{proximity.remainingPOICount}</Text>
          <Text style={styles.statLabel}>Remaining</Text>
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
    backgroundColor: COLORS.bg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    maxWidth: 220,
  },
  headerSub: {
    fontSize: 13,
    color: COLORS.textSub,
    marginTop: 2,
  },
  endBtn: {
    backgroundColor: COLORS.red,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  endBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  // ── Location panel
  locationPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.green,
    marginRight: 8,
  },
  locationText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  locationSub: {
    color: COLORS.teal,
  },
  // ── POI list
  poiListWrapper: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSub,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  poiScroll: {
    flex: 1,
  },
  poiListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  poiListItemActive: {
    borderColor: COLORS.gold,
    backgroundColor: '#1e2840',
  },
  poiListIcon: {
    fontSize: 22,
    marginRight: 12,
    width: 28,
    textAlign: 'center',
  },
  poiListName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  poiListNamePlayed: {
    color: COLORS.muted,
    textDecorationLine: 'line-through',
  },
  poiListDistance: {
    color: COLORS.teal,
    fontWeight: '400',
  },
  poiListMeta: {
    fontSize: 12,
    color: COLORS.textSub,
    marginTop: 2,
  },
  poiListStatus: {
    fontSize: 18,
    color: COLORS.textSub,
    marginLeft: 8,
  },
  noPoisBox: {
    alignItems: 'center',
    padding: 40,
  },
  noPoisText: {
    color: COLORS.muted,
    fontSize: 15,
  },
  // ── Stats bar
  statsBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.gold,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSub,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  // ── POI card (slide-up)
  poiCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.gold,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 16,
  },
  poiImage: {
    width: '100%',
    height: 160,
  },
  poiImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poiImageIcon: {
    fontSize: 48,
  },
  poiInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
  },
  poiName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  poiMeta: {
    fontSize: 13,
    color: COLORS.textSub,
  },
  bookmarkBtn: {
    paddingLeft: 12,
    paddingTop: 2,
  },
  bookmarkIcon: {
    fontSize: 26,
    color: COLORS.muted,
  },
  bookmarkActive: {
    color: COLORS.gold,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  skipBtn: {
    flex: 1,
    backgroundColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipBtnText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  playPauseBtn: {
    flex: 1,
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  playPauseBtnText: {
    color: '#000',
    fontSize: 20,
    fontWeight: '700',
  },
  queueRow: {
    backgroundColor: COLORS.surface,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  queueText: {
    color: COLORS.teal,
    fontSize: 13,
    textAlign: 'center',
  },
  // ── Misc
  loadingText: {
    color: COLORS.textSub,
    fontSize: 16,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 16,
    marginBottom: 20,
  },
  btn: {
    backgroundColor: COLORS.teal,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  btnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 15,
  },
});
