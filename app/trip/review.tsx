/**
 * app/trip/review.tsx
 *
 * Post-Trip Review Screen
 * Shows trip statistics, POI list with play/skip/bookmark status,
 * GPS breadcrumb trail summary, and action buttons.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  getTrip,
  getTripLog,
  getBreadcrumbs,
  deleteTrip,
  updatePOI,
} from '@/src/services/storage/tripStorage';
import { useNarrationPlayer } from '@/src/hooks/useNarrationPlayer';
import type { Trip, TripLogEntry, GpsBreadcrumb } from '@/src/types/trip';
import type { POI } from '@/src/types/poi';

// ─── Palette ───────────────────────────────────────────────────────────────────
const C = {
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
  amber: '#f59e0b',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
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

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  const hrs = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function totalListeningMinutes(pois: POI[], log: TripLogEntry[]): number {
  const playedIds = new Set(log.filter((e) => !e.skipped).map((e) => e.poi_id));
  return pois
    .filter((p) => playedIds.has(p.id))
    .reduce((acc, p) => acc + p.estimated_listen_minutes, 0);
}

// Rough distance from breadcrumbs in km
function trailDistanceKm(crumbs: GpsBreadcrumb[]): number {
  if (crumbs.length < 2) return 0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < crumbs.length; i++) {
    const a = crumbs[i - 1];
    const b = crumbs[i];
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    total += 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  return total;
}

// ─── POI Item ──────────────────────────────────────────────────────────────────
interface POIItemProps {
  poi: POI;
  logEntry: TripLogEntry | undefined;
  onBookmark: (poi: POI) => void;
  onReplay: (poi: POI) => void;
}

function POIItem({ poi, logEntry, onBookmark, onReplay }: POIItemProps) {
  const [expanded, setExpanded] = useState(false);
  const played = !!logEntry && !logEntry.skipped;
  const skipped = !!logEntry && logEntry.skipped;

  return (
    <View style={pStyles.item}>
      {/* Header row */}
      <TouchableOpacity
        style={pStyles.headerRow}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <Text style={pStyles.icon}>{categoryIcon(poi.category)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={pStyles.name} numberOfLines={expanded ? undefined : 1}>
            {poi.name}
          </Text>
          <Text style={pStyles.meta}>
            {poi.category.replace(/_/g, ' ')} · {poi.estimated_listen_minutes.toFixed(0)} min
            {logEntry
              ? ` · ${new Date(logEntry.played_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </Text>
        </View>
        {/* Status badge */}
        <View
          style={[
            pStyles.badge,
            played && pStyles.badgePlayed,
            skipped && pStyles.badgeSkipped,
          ]}
        >
          <Text style={pStyles.badgeText}>
            {played ? '✓ Played' : skipped ? '⏭ Skipped' : '○ Unvisited'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Expanded narration */}
      {expanded && (
        <View style={pStyles.narrationBox}>
          <Text style={pStyles.narrationText}>{poi.narration_text}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={pStyles.actionRow}>
        <TouchableOpacity
          style={pStyles.actionBtn}
          onPress={() => onBookmark(poi)}
        >
          <Text style={[pStyles.actionBtnText, poi.bookmarked && pStyles.bookmarked]}>
            {poi.bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
          </Text>
        </TouchableOpacity>
        {(played || skipped) && (
          <TouchableOpacity
            style={[pStyles.actionBtn, pStyles.replayBtn]}
            onPress={() => onReplay(poi)}
          >
            <Text style={pStyles.replayText}>↺ Replay</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const pStyles = StyleSheet.create({
  item: {
    backgroundColor: '#1a2236',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#252f47',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  icon: { fontSize: 22, width: 28, textAlign: 'center' },
  name: { fontSize: 15, fontWeight: '600', color: '#f1f5f9' },
  meta: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  badge: {
    backgroundColor: '#252f47',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgePlayed: { backgroundColor: '#14532d' },
  badgeSkipped: { backgroundColor: '#1c1917' },
  badgeText: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  narrationBox: {
    borderTopWidth: 1,
    borderTopColor: '#252f47',
    padding: 14,
    backgroundColor: '#131929',
  },
  narrationText: { fontSize: 14, color: '#cbd5e1', lineHeight: 22 },
  actionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#252f47',
    padding: 10,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#252f47',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  actionBtnText: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  bookmarked: { color: '#f5c842' },
  replayBtn: { backgroundColor: '#1e3a5f' },
  replayText: { fontSize: 13, color: '#2dd4bf', fontWeight: '600' },
});

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function TripReviewScreen() {
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = params.tripId ?? '';

  const [trip, setTrip] = useState<Trip | null>(null);
  const [log, setLog] = useState<TripLogEntry[]>([]);
  const [breadcrumbs, setCrumbs] = useState<GpsBreadcrumb[]>([]);
  const [loading, setLoading] = useState(true);

  const narration = useNarrationPlayer();

  // Load
  useEffect(() => {
    async function load() {
      try {
        if (!tripId) { setLoading(false); return; }
        const [t, l, c] = await Promise.all([
          getTrip(tripId),
          getTripLog(tripId),
          getBreadcrumbs(tripId),
        ]);
        setTrip(t);
        setLog(l);
        setCrumbs(c);
      } catch {
        Alert.alert('Error', 'Could not load trip details.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tripId]);

  const handleBookmark = useCallback(async (poi: POI) => {
    try {
      const updated = { ...poi, bookmarked: !poi.bookmarked };
      await updatePOI(updated);
      setTrip((t) =>
        t
          ? {
              ...t,
              pois: t.pois.map((p) => (p.id === poi.id ? updated : p)),
            }
          : t
      );
    } catch {
      Alert.alert('Error', 'Could not update bookmark.');
    }
  }, []);

  const handleReplay = useCallback((poi: POI) => {
    narration.enqueue(poi);
    Alert.alert('Replaying', `Now playing: ${poi.name}`);
  }, [narration.enqueue]);

  const handleShare = useCallback(async () => {
    if (!trip) return;
    try {
      const playedCount = log.filter((e) => !e.skipped).length;
      const msg = [
        `🌍 Trip: ${trip.name}`,
        `📍 Destination: ${trip.destination.name}`,
        `🗓 Date: ${formatDate(trip.created_at)}`,
        `⏱ Duration: ${formatDuration(trip.started_at, trip.completed_at)}`,
        `🎧 POIs listened: ${playedCount}/${trip.pois.length}`,
        '',
        'Made with Travel Companion ✈️',
      ].join('\n');
      await Share.share({ message: msg, title: trip.name });
    } catch {
      // user cancelled
    }
  }, [trip, log]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Trip?',
      'This will permanently delete the trip and all its data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (tripId) await deleteTrip(tripId);
              router.replace('/(tabs)/trips');
            } catch {
              Alert.alert('Error', 'Could not delete the trip.');
            }
          },
        },
      ]
    );
  }, [tripId]);

  const handleDone = useCallback(() => {
    router.replace('/(tabs)/trips');
  }, []);

  // ── Loading / error ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <Stack.Screen options={{ title: 'Trip Review' }} />
        <Text style={s.muted}>Loading trip…</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[s.container, s.center]}>
        <Stack.Screen options={{ title: 'Trip Review' }} />
        <Text style={s.errorText}>Trip not found.</Text>
        <TouchableOpacity onPress={handleDone} style={s.btn}>
          <Text style={s.btnText}>Back to Trips</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const playedCount = log.filter((e) => !e.skipped).length;
  const skippedCount = log.filter((e) => e.skipped).length;
  const totalMins = totalListeningMinutes(trip.pois, log);
  const distKm = trailDistanceKm(breadcrumbs);
  const logMap = new Map<string, TripLogEntry>(log.map((e) => [e.poi_id, e]));

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <Stack.Screen options={{ title: 'Trip Review' }} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Trip header ──────────────────────────────────────────────── */}
        <View style={s.tripHeader}>
          <Text style={s.tripName}>{trip.name}</Text>
          <Text style={s.tripDest}>📍 {trip.destination.name}</Text>
          <Text style={s.tripDate}>
            {formatDate(trip.created_at)}
            {trip.completed_at
              ? ` → ${formatDate(trip.completed_at)}`
              : ''}
          </Text>
          <View
            style={[s.statusBadge, trip.status === 'completed' && s.statusCompleted]}
          >
            <Text style={s.statusText}>{trip.status.toUpperCase()}</Text>
          </View>
        </View>

        {/* ── Stats grid ──────────────────────────────────────────────── */}
        <View style={s.statsGrid}>
          <StatCard label="POIs Total" value={String(trip.pois.length)} icon="📍" />
          <StatCard label="Listened" value={String(playedCount)} icon="🎧" />
          <StatCard label="Skipped" value={String(skippedCount)} icon="⏭" />
          <StatCard
            label="Listen Time"
            value={`${totalMins.toFixed(0)}m`}
            icon="⏱"
          />
          <StatCard
            label="Distance"
            value={distKm > 0 ? `${distKm.toFixed(1)} km` : '—'}
            icon="🛣"
          />
          <StatCard
            label="Duration"
            value={formatDuration(trip.started_at, trip.completed_at)}
            icon="🕐"
          />
        </View>

        {/* ── GPS breadcrumb trail summary ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>GPS Trail</Text>
          {breadcrumbs.length === 0 ? (
            <Text style={s.muted}>No GPS breadcrumbs recorded.</Text>
          ) : (
            <View style={s.trailBox}>
              <Text style={s.trailText}>
                🛣 {breadcrumbs.length} waypoints recorded
              </Text>
              <Text style={s.trailText}>
                📏 Distance: {distKm > 0 ? `${distKm.toFixed(2)} km` : '—'}
              </Text>
              {breadcrumbs[0] && (
                <Text style={s.trailText}>
                  🟢 Start: {breadcrumbs[0].lat.toFixed(5)},{' '}
                  {breadcrumbs[0].lng.toFixed(5)}
                </Text>
              )}
              {breadcrumbs[breadcrumbs.length - 1] && (
                <Text style={s.trailText}>
                  🔴 End:{' '}
                  {breadcrumbs[breadcrumbs.length - 1].lat.toFixed(5)},{' '}
                  {breadcrumbs[breadcrumbs.length - 1].lng.toFixed(5)}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* ── POI list ────────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Points of Interest</Text>
          {trip.pois.map((poi) => (
            <POIItem
              key={poi.id}
              poi={poi}
              logEntry={logMap.get(poi.id)}
              onBookmark={handleBookmark}
              onReplay={handleReplay}
            />
          ))}
          {trip.pois.length === 0 && (
            <Text style={s.muted}>No POIs in this trip.</Text>
          )}
        </View>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <View style={s.actionRow}>
          <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
            <Text style={s.shareBtnText}>↗ Share Trip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
            <Text style={s.deleteBtnText}>🗑 Delete</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.doneBtn} onPress={handleDone}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statCardIcon}>{icon}</Text>
      <Text style={s.statCardValue}>{value}</Text>
      <Text style={s.statCardLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Trip header
  tripHeader: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  tripName: {
    fontSize: 22,
    fontWeight: '800',
    color: C.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  tripDest: { fontSize: 15, color: C.textSub, marginBottom: 4 },
  tripDate: { fontSize: 13, color: C.muted, marginBottom: 12 },
  statusBadge: {
    backgroundColor: C.muted,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusCompleted: { backgroundColor: '#14532d' },
  statusText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    width: '30%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: C.border,
  },
  statCardIcon: { fontSize: 20, marginBottom: 4 },
  statCardValue: {
    fontSize: 18,
    fontWeight: '700',
    color: C.gold,
  },
  statCardLabel: { fontSize: 11, color: C.textSub, marginTop: 2, textAlign: 'center' },

  // Section
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSub,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // GPS Trail
  trailBox: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  trailText: { fontSize: 14, color: C.text },

  // Actions
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  shareBtn: {
    flex: 1,
    backgroundColor: C.teal,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  deleteBtn: {
    flex: 1,
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.red,
  },
  deleteBtnText: { color: C.red, fontWeight: '700', fontSize: 15 },
  doneBtn: {
    backgroundColor: C.gold,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  doneBtnText: { color: '#000', fontWeight: '800', fontSize: 17 },

  // misc
  muted: { color: C.muted, fontSize: 14 },
  errorText: { color: C.red, fontSize: 16, marginBottom: 20 },
  btn: {
    backgroundColor: C.teal,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  btnText: { color: '#000', fontWeight: '700', fontSize: 15 },
});
