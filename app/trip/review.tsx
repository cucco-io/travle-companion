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
  ActivityIndicator,
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
import { SymbolView } from 'expo-symbols';

import { useAppTheme } from '@/src/theme/ThemeContext';
import {
  PrimaryButton,
  SecondaryButton,
  DestructiveButton,
  Badge,
  Icon,
} from '@/src/theme/UIComponents';
import { Icons, getCategoryIcon, SymbolName } from '@/src/theme/icons';
import { Typography, Spacing, Radius } from '@/src/theme/theme';

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
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  const played = !!logEntry && !logEntry.skipped;
  const skipped = !!logEntry && logEntry.skipped;

  return (
    <View style={[pStyles.item, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
      {/* Header row */}
      <TouchableOpacity
        style={pStyles.headerRow}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <Icon name={getCategoryIcon(poi.category)} size={20} color={colors.textSecondary} style={{ marginRight: Spacing.sm }} />
        <View style={{ flex: 1 }}>
          <Text style={[Typography.subheadline, { fontWeight: '600', color: colors.textPrimary }]} numberOfLines={expanded ? undefined : 1}>
            {poi.name}
          </Text>
          <Text style={[Typography.caption2, { color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' }]}>
            {poi.category.replace(/_/g, ' ')} · {poi.estimated_listen_minutes.toFixed(0)} min
            {logEntry
              ? ` · ${new Date(logEntry.played_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </Text>
        </View>
        {/* Status badge */}
        <Badge
          label={played ? 'Played' : skipped ? 'Skipped' : 'Unvisited'}
          color={colors.backgroundElevated}
          backgroundColor={played ? colors.success : skipped ? colors.textSecondary : colors.fillSecondary}
        />
      </TouchableOpacity>

      {/* Expanded narration */}
      {expanded && (
        <View style={[pStyles.narrationBox, { backgroundColor: colors.fillTertiary, borderTopColor: colors.separator, borderBottomColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <Text style={[Typography.body, { color: colors.textPrimary, lineHeight: 22 }]}>{poi.narration_text}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={[pStyles.actionRow, { borderTopColor: colors.separator }]}>
        <TouchableOpacity
          style={[pStyles.actionBtn, { backgroundColor: colors.fillTertiary }]}
          onPress={() => onBookmark(poi)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <SymbolView
              name={poi.bookmarked ? Icons.bookmarkFilled : Icons.bookmark}
              tintColor={poi.bookmarked ? colors.warning : colors.textSecondary}
              size={14}
              style={{ marginRight: 6 }}
            />
            <Text style={[Typography.footnote, { fontWeight: '600', color: poi.bookmarked ? colors.warning : colors.textSecondary }]}>
              {poi.bookmarked ? 'Bookmarked' : 'Bookmark'}
            </Text>
          </View>
        </TouchableOpacity>
        {(played || skipped) && (
          <TouchableOpacity
            style={[pStyles.actionBtn, { backgroundColor: colors.tint + '15' }]}
            onPress={() => onReplay(poi)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <SymbolView name={Icons.replay} tintColor={colors.tint} size={14} style={{ marginRight: 6 }} />
              <Text style={[Typography.footnote, { fontWeight: '600', color: colors.tint }]}>Replay</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const pStyles = StyleSheet.create({
  item: {
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
  },
  narrationBox: {
    padding: Spacing.base,
  },
  actionRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function TripReviewScreen() {
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = params.tripId ?? '';
  const { colors, colorScheme } = useAppTheme();

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
  }, [narration]);

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
      <View style={[s.container, s.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Trip Review' }} />
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.base }]}>Loading trip review…</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[s.container, s.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Trip Review' }} />
        <Text style={[Typography.body, { color: colors.destructive, marginBottom: Spacing.xl }]}>Trip not found.</Text>
        <SecondaryButton title="Back to Trips" onPress={handleDone} />
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
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <Stack.Screen options={{ title: 'Trip Review' }} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Trip header ──────────────────────────────────────────────── */}
        <View style={[s.tripHeader, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
          <Text style={[Typography.title2, { color: colors.textPrimary, textAlign: 'center', marginBottom: Spacing.xs }]}>{trip.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs }}>
            <SymbolView name={Icons.mappin} tintColor={colors.textSecondary} size={14} style={{ marginRight: 4 }} />
            <Text style={[Typography.subheadline, { color: colors.textSecondary }]}>{trip.destination.name}</Text>
          </View>
          <Text style={[Typography.caption2, { color: colors.textTertiary, marginBottom: Spacing.md }]}>
            {formatDate(trip.created_at)}
            {trip.completed_at
              ? ` → ${formatDate(trip.completed_at)}`
              : ''}
          </Text>
          <Badge
            label={trip.status.toUpperCase()}
            color={colors.backgroundElevated}
            backgroundColor={trip.status === 'completed' ? colors.success : colors.tint}
          />
        </View>

        {/* ── Stats grid ──────────────────────────────────────────────── */}
        <View style={s.statsGrid}>
          <StatCard label="POIs Total" value={String(trip.pois.length)} icon={Icons.mappin} />
          <StatCard label="Listened" value={String(playedCount)} icon={Icons.headphones} />
          <StatCard label="Skipped" value={String(skippedCount)} icon={Icons.skipForward} />
          <StatCard
            label="Listen Time"
            value={`${totalMins.toFixed(0)}m`}
            icon={Icons.clock}
          />
          <StatCard
            label="Distance"
            value={distKm > 0 ? `${distKm.toFixed(1)} km` : '—'}
            icon={Icons.route}
          />
          <StatCard
            label="Duration"
            value={formatDuration(trip.started_at, trip.completed_at)}
            icon={Icons.calendar}
          />
        </View>

        {/* ── GPS breadcrumb trail summary ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={[Typography.caption2, { color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm }]}>GPS Trail</Text>
          {breadcrumbs.length === 0 ? (
            <Text style={[Typography.body, { color: colors.textTertiary }]}>No GPS breadcrumbs recorded.</Text>
          ) : (
            <View style={[s.trailBox, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
              <View style={s.trailRow}>
                <SymbolView name={Icons.route} tintColor={colors.tint} size={14} style={{ marginRight: 6 }} />
                <Text style={[Typography.body, { color: colors.textPrimary }]}>
                  {breadcrumbs.length} waypoints recorded
                </Text>
              </View>
              <View style={s.trailRow}>
                <SymbolView name={Icons.ruler} tintColor={colors.tint} size={14} style={{ marginRight: 6 }} />
                <Text style={[Typography.body, { color: colors.textPrimary }]}>
                  Distance: {distKm > 0 ? `${distKm.toFixed(2)} km` : '—'}
                </Text>
              </View>
              {breadcrumbs[0] && (
                <View style={s.trailRow}>
                  <SymbolView name={Icons.circle} tintColor={colors.success} size={14} style={{ marginRight: 6 }} />
                  <Text style={[Typography.footnote, { color: colors.textSecondary }]}>
                    Start: {breadcrumbs[0].lat.toFixed(5)}, {breadcrumbs[0].lng.toFixed(5)}
                  </Text>
                </View>
              )}
              {breadcrumbs[breadcrumbs.length - 1] && (
                <View style={s.trailRow}>
                  <SymbolView name={Icons.circle} tintColor={colors.destructive} size={14} style={{ marginRight: 6 }} />
                  <Text style={[Typography.footnote, { color: colors.textSecondary }]}>
                    End: {breadcrumbs[breadcrumbs.length - 1].lat.toFixed(5)}, {breadcrumbs[breadcrumbs.length - 1].lng.toFixed(5)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── POI list ────────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={[Typography.caption2, { color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm }]}>Points of Interest</Text>
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
            <Text style={[Typography.body, { color: colors.textTertiary }]}>No POIs in this trip.</Text>
          )}
        </View>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <View style={s.actionGrid}>
          <SecondaryButton
            title="Share Trip"
            icon={Icons.share}
            onPress={handleShare}
            style={{ flex: 1 }}
          />
          <DestructiveButton
            title="Delete"
            icon={Icons.trash}
            onPress={handleDelete}
            style={{ flex: 1 }}
          />
        </View>
        <PrimaryButton
          title="Done"
          icon={Icons.checkmark}
          onPress={handleDone}
          style={{ marginTop: Spacing.md }}
        />
      </ScrollView>
    </View>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon }: { label: string; value: string; icon: SymbolName }) {
  const { colors } = useAppTheme();
  return (
    <View style={[s.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder }]}>
      <SymbolView name={icon} tintColor={colors.tint} size={20} style={{ marginBottom: Spacing.xs }} />
      <Text style={[Typography.headline, { color: colors.textPrimary, fontWeight: '700' }]}>{value}</Text>
      <Text style={[Typography.caption2, { color: colors.textSecondary, marginTop: 2, textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  scrollContent: { padding: Spacing.base, paddingBottom: Spacing.xl * 2 },

  // Trip header
  tripHeader: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.base,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  statCard: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    width: '30%',
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Section
  section: { marginBottom: Spacing.base },

  // GPS Trail
  trailBox: {
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  trailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Actions
  actionGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
