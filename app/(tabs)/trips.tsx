/**
 * app/(tabs)/trips.tsx
 *
 * Trip History Screen — lists all trips sorted newest-first.
 * Supports pull-to-refresh, swipe-to-delete, and tap navigation.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  PanResponder,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { getAllTrips, deleteTrip } from '@/src/services/storage/tripStorage';
import type { Trip, TripStatus } from '@/src/types/trip';

// ─── Palette ────────────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0e1a',
  surface: '#131929',
  card: '#1a2236',
  border: '#252f47',
  gold: '#f5c842',
  teal: '#2dd4bf',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  blue: '#3b82f6',
  muted: '#6b7280',
  text: '#f1f5f9',
  textSub: '#94a3b8',
};

// ─── Status badge config ────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  TripStatus,
  { label: string; color: string; bg: string }
> = {
  preparing: { label: 'Preparing', color: '#000', bg: C.amber },
  ready: { label: 'Ready', color: '#fff', bg: C.blue },
  active: { label: 'Active', color: '#000', bg: C.green },
  completed: { label: 'Completed', color: C.textSub, bg: '#1e293b' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Swipeable Trip Card ────────────────────────────────────────────────────────
interface TripCardProps {
  trip: Trip & { poi_count?: number };
  onDelete: (id: string, name: string) => void;
  onPress: (trip: Trip) => void;
}

function TripCard({ trip, onDelete, onPress }: TripCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [swiped, setSwiped] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dy) < 20,
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) {
          translateX.setValue(Math.max(g.dx, -100));
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -60) {
          // Snap to reveal delete button
          Animated.spring(translateX, {
            toValue: -80,
            useNativeDriver: true,
          }).start();
          setSwiped(true);
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          setSwiped(false);
        }
      },
    })
  ).current;

  const closeSwipe = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
    setSwiped(false);
  }, [translateX]);

  const statusCfg = STATUS_CONFIG[trip.status];
  const poiCount = (trip as Trip & { poi_count?: number }).poi_count ?? trip.pois.length;

  return (
    <View style={card.wrapper}>
      {/* Delete reveal */}
      <View style={card.deleteReveal}>
        <TouchableOpacity
          style={card.deleteBtn}
          onPress={() => {
            closeSwipe();
            onDelete(trip.id, trip.name);
          }}
        >
          <Text style={card.deleteBtnText}>🗑{'\n'}Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Main card */}
      <Animated.View
        style={[card.card, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            if (swiped) { closeSwipe(); return; }
            onPress(trip);
          }}
          style={card.inner}
        >
          {/* Top row: name + status */}
          <View style={card.topRow}>
            <Text style={card.name} numberOfLines={1}>
              {trip.name}
            </Text>
            <View style={[card.badge, { backgroundColor: statusCfg.bg }]}>
              <Text style={[card.badgeText, { color: statusCfg.color }]}>
                {statusCfg.label}
              </Text>
            </View>
          </View>

          {/* Destination */}
          <Text style={card.dest} numberOfLines={1}>
            📍 {trip.destination.name}
          </Text>

          {/* Bottom meta row */}
          <View style={card.metaRow}>
            <Text style={card.meta}>🗓 {formatDate(trip.created_at)}</Text>
            <Text style={card.meta}>
              📌 {poiCount} POI{poiCount !== 1 ? 's' : ''}
            </Text>
            <Text style={card.meta}>
              {trip.mode === 'route' ? '🚗 Route' : '🏙 City'}
            </Text>
          </View>

          {/* Navigate hint */}
          <Text style={card.chevron}>›</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const card = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    position: 'relative',
  },
  deleteReveal: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: C.red,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  deleteBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  inner: {
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    flex: 1,
    marginRight: 8,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  dest: {
    fontSize: 13,
    color: C.textSub,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  meta: { fontSize: 12, color: C.muted },
  chevron: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    fontSize: 22,
    color: C.muted,
  },
});

// ─── Empty state ────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <View style={empty.container}>
      <Text style={empty.globe}>🌍</Text>
      <Text style={empty.title}>No Trips Yet</Text>
      <Text style={empty.subtitle}>
        Your travel adventures will appear here.{'\n'}
        Start by exploring a destination!
      </Text>
      <TouchableOpacity
        style={empty.cta}
        onPress={() => router.push('/(tabs)/')}
      >
        <Text style={empty.ctaText}>✈️  Explore Destinations</Text>
      </TouchableOpacity>
    </View>
  );
}

const empty = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  globe: { fontSize: 72, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 10 },
  subtitle: {
    fontSize: 15,
    color: C.textSub,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  cta: {
    backgroundColor: C.gold,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#000' },
});

// ─── Main screen ────────────────────────────────────────────────────────────────
export default function TripsScreen() {
  const [trips, setTrips] = useState<(Trip & { poi_count?: number })[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadTrips = useCallback(async () => {
    try {
      const all = await getAllTrips();
      // Sort newest first (getAllTrips already does this, but ensure)
      all.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setTrips(all as (Trip & { poi_count?: number })[]);
    } catch {
      Alert.alert('Error', 'Could not load trips.');
    }
  }, []);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTrips();
    setRefreshing(false);
  }, [loadTrips]);

  const handleDelete = useCallback(
    (id: string, name: string) => {
      Alert.alert(
        'Delete Trip?',
        `"${name}" and all its data will be permanently deleted.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteTrip(id);
                setTrips((prev) => prev.filter((t) => t.id !== id));
              } catch {
                Alert.alert('Error', 'Could not delete the trip.');
              }
            },
          },
        ]
      );
    },
    []
  );

  const handlePress = useCallback((trip: Trip) => {
    switch (trip.status) {
      case 'preparing':
        router.push(`/trip/prepare?tripId=${trip.id}`);
        break;
      case 'ready':
      case 'active':
        router.push(`/trip/active?tripId=${trip.id}`);
        break;
      case 'completed':
        router.push(`/trip/review?tripId=${trip.id}`);
        break;
    }
  }, []);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>My Trips</Text>
        <Text style={s.headerSub}>
          {trips.length} trip{trips.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[
          s.listContent,
          trips.length === 0 && s.listContentEmpty,
        ]}
        renderItem={({ item }) => (
          <TripCard
            trip={item}
            onDelete={handleDelete}
            onPress={handlePress}
          />
        )}
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.gold}
            colors={[C.gold]}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: C.text,
  },
  headerSub: {
    fontSize: 13,
    color: C.textSub,
    marginTop: 2,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  listContentEmpty: {
    flex: 1,
  },
});
