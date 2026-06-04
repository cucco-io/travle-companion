/**
 * src/services/storage/tripStorage.ts
 *
 * Trip CRUD operations using expo-sqlite.
 * Manages persistence of trips, POIs, log entries, and breadcrumbs.
 *
 * Database schema:
 * - trips: main trip metadata
 * - pois: POI data linked to trips
 * - trip_log: play/skip events during active trips
 * - gps_breadcrumbs: GPS trail for post-trip visualization
 *
 * Dependencies:
 * - expo-sqlite (SQLite.openDatabaseAsync)
 * - src/types/trip.ts (Trip, TripLogEntry, GpsBreadcrumb)
 * - src/types/poi.ts (POI)
 */

import * as SQLite from 'expo-sqlite';
import { Trip, TripLogEntry, GpsBreadcrumb, TripStatus } from '../../types/trip';
import { POI } from '../../types/poi';
import { getTripFileSizeMB, deleteTripFiles } from './fileStorage';

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Gets the singleton database instance.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('travel_companion.db');
  }
  return dbInstance;
}

/**
 * Initializes the SQLite database and creates tables if they don't exist.
 *
 * Should be called once during app startup.
 *
 * Implementation notes:
 * - Use SQLite.openDatabaseAsync('travel_companion.db')
 * - Create tables with CREATE TABLE IF NOT EXISTS:
 *   - trips (id TEXT PRIMARY KEY, name TEXT, mode TEXT, status TEXT,
 *            preferences TEXT (JSON), origin TEXT (JSON), destination TEXT (JSON),
 *            route_polyline TEXT, created_at TEXT, started_at TEXT,
 *            completed_at TEXT, total_size_mb REAL)
 *   - pois (id TEXT PRIMARY KEY, trip_id TEXT, name TEXT, category TEXT,
 *           lat REAL, lng REAL, rating REAL, narration_text TEXT,
 *           narration_word_count INTEGER, estimated_listen_minutes REAL,
 *           audio_file_path TEXT, trigger_radius_meters REAL,
 *           priority REAL, image_url TEXT, image_local_path TEXT,
 *           bookmarked INTEGER, played_at TEXT,
 *           FOREIGN KEY (trip_id) REFERENCES trips(id))
 *   - trip_log (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT,
 *              poi_id TEXT, played_at TEXT, lat REAL, lng REAL, skipped INTEGER)
 *   - gps_breadcrumbs (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id TEXT,
 *                      timestamp TEXT, lat REAL, lng REAL)
 * - Use WAL mode for better concurrent read performance
 *
 * @throws Error if database initialization fails
 */
export async function initializeDatabase(): Promise<void> {
  try {
    const db = await getDb();
    
    // Enable WAL mode
    await db.execAsync('PRAGMA journal_mode = WAL;');
    
    // Enable Foreign Keys for cascading deletes
    await db.execAsync('PRAGMA foreign_keys = ON;');
    
    // Create tables
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        preferences TEXT NOT NULL,
        origin TEXT,
        destination TEXT NOT NULL,
        route_polyline TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        total_size_mb REAL NOT NULL DEFAULT 0.0
      );

      CREATE TABLE IF NOT EXISTS pois (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        rating REAL NOT NULL,
        narration_text TEXT NOT NULL,
        narration_word_count INTEGER NOT NULL,
        estimated_listen_minutes REAL NOT NULL,
        audio_file_path TEXT,
        trigger_radius_meters REAL NOT NULL,
        priority REAL NOT NULL,
        image_url TEXT,
        image_local_path TEXT,
        bookmarked INTEGER NOT NULL DEFAULT 0,
        played_at TEXT,
        FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS trip_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id TEXT NOT NULL,
        poi_id TEXT NOT NULL,
        played_at TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        skipped INTEGER NOT NULL,
        FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS gps_breadcrumbs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
      );
    `);
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

/**
 * Creates a new trip record in the database.
 *
 * @param trip - The trip object to persist
 * @returns The created trip ID (string)
 *
 * Implementation notes:
 * - Serialize preferences, origin, destination as JSON strings
 * - POIs are stored in the separate `pois` table (call savePOIs separately)
 * - Set initial status to 'preparing'
 */
export async function createTrip(trip: Trip): Promise<string> {
  const db = await getDb();
  
  await db.runAsync(
    `INSERT INTO trips (id, name, mode, status, preferences, origin, destination, route_polyline, created_at, started_at, completed_at, total_size_mb)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    trip.id,
    trip.name,
    trip.mode,
    trip.status,
    JSON.stringify(trip.preferences),
    trip.origin ? JSON.stringify(trip.origin) : null,
    JSON.stringify(trip.destination),
    trip.route_polyline,
    trip.created_at,
    trip.started_at,
    trip.completed_at,
    trip.total_size_mb
  );

  if (trip.pois && trip.pois.length > 0) {
    await savePOIs(trip.id, trip.pois);
  }

  return trip.id;
}

/**
 * Retrieves a trip by its ID, including all associated POIs.
 *
 * @param tripId - The trip's unique ID
 * @returns The full Trip object with POIs populated, or null if not found
 *
 * Implementation notes:
 * - Query the trips table for the trip metadata
 * - Query the pois table for all POIs with matching trip_id
 * - Deserialize JSON fields (preferences, origin, destination)
 * - Attach POIs to the trip object
 */
export async function getTripById(tripId: string): Promise<Trip | null> {
  const db = await getDb();

  interface TripRow {
    id: string;
    name: string;
    mode: string;
    status: string;
    preferences: string;
    origin: string | null;
    destination: string;
    route_polyline: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    total_size_mb: number;
  }

  const tripRow = await db.getFirstAsync<TripRow>(
    `SELECT * FROM trips WHERE id = ?`,
    tripId
  );

  if (!tripRow) {
    return null;
  }

  interface POIRow {
    id: string;
    name: string;
    category: string;
    lat: number;
    lng: number;
    rating: number;
    narration_text: string;
    narration_word_count: number;
    estimated_listen_minutes: number;
    audio_file_path: string | null;
    trigger_radius_meters: number;
    priority: number;
    image_url: string | null;
    image_local_path: string | null;
    bookmarked: number;
    played_at: string | null;
  }

  const poiRows = await db.getAllAsync<POIRow>(
    `SELECT * FROM pois WHERE trip_id = ? ORDER BY priority DESC`,
    tripId
  );

  const pois: POI[] = poiRows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category as any,
    coordinates: {
      lat: row.lat,
      lng: row.lng,
    },
    rating: row.rating,
    narration_text: row.narration_text,
    narration_word_count: row.narration_word_count,
    estimated_listen_minutes: row.estimated_listen_minutes,
    audio_file_path: row.audio_file_path,
    trigger_radius_meters: row.trigger_radius_meters,
    priority: row.priority,
    image_url: row.image_url,
    image_local_path: row.image_local_path,
    bookmarked: row.bookmarked !== 0,
    played_at: row.played_at,
  }));

  return {
    id: tripRow.id,
    name: tripRow.name,
    mode: tripRow.mode as any,
    status: tripRow.status as any,
    preferences: JSON.parse(tripRow.preferences),
    origin: tripRow.origin ? JSON.parse(tripRow.origin) : null,
    destination: JSON.parse(tripRow.destination),
    route_polyline: tripRow.route_polyline,
    created_at: tripRow.created_at,
    started_at: tripRow.started_at,
    completed_at: tripRow.completed_at,
    total_size_mb: tripRow.total_size_mb,
    pois,
  };
}

/**
 * Alias for getTripById to fulfill WI-4 exact name requirements.
 */
export async function getTrip(id: string): Promise<Trip | null> {
  return getTripById(id);
}

/**
 * Lists all trips, optionally filtered by status.
 *
 * @param status - Optional status filter
 * @param limit - Maximum number of trips to return (default: 50)
 * @returns Array of Trip objects (POIs NOT included for performance)
 *
 * Implementation notes:
 * - Order by created_at DESC (newest first)
 * - For list views, omit POIs to keep the query fast
 * - Include a poi_count field from a COUNT subquery
 */
export async function listTrips(
  status?: TripStatus,
  limit: number = 50
): Promise<Trip[]> {
  const db = await getDb();

  interface TripRowWithPoiCount {
    id: string;
    name: string;
    mode: string;
    status: string;
    preferences: string;
    origin: string | null;
    destination: string;
    route_polyline: string | null;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    total_size_mb: number;
    poi_count: number;
  }

  let sql = `
    SELECT t.*, COUNT(p.id) as poi_count
    FROM trips t
    LEFT JOIN pois p ON t.id = p.trip_id
  `;
  const params: any[] = [];

  if (status) {
    sql += ` WHERE t.status = ? `;
    params.push(status);
  }

  sql += `
    GROUP BY t.id
    ORDER BY t.created_at DESC
    LIMIT ?
  `;
  params.push(limit);

  const rows = await db.getAllAsync<TripRowWithPoiCount>(sql, ...params);

  return rows.map((row) => {
    const trip: any = {
      id: row.id,
      name: row.name,
      mode: row.mode as any,
      status: row.status as any,
      preferences: JSON.parse(row.preferences),
      origin: row.origin ? JSON.parse(row.origin) : null,
      destination: JSON.parse(row.destination),
      route_polyline: row.route_polyline,
      created_at: row.created_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      total_size_mb: row.total_size_mb,
      pois: [], // Omit detailed POIs for listing performance
    };
    trip.poi_count = row.poi_count;
    return trip;
  });
}

/**
 * Returns all trips ordered by created_at DESC.
 */
export async function getAllTrips(): Promise<Trip[]> {
  return listTrips();
}

/**
 * Updates a trip's status and related timestamps.
 *
 * @param tripId - The trip's unique ID
 * @param status - The new status
 *
 * Implementation notes:
 * - When status → 'active': set started_at = new Date().toISOString()
 * - When status → 'completed': set completed_at = new Date().toISOString()
 * - When status → 'ready': calculate total_size_mb from associated audio files
 */
export async function updateTripStatus(
  tripId: string,
  status: TripStatus
): Promise<void> {
  const db = await getDb();

  let startedAt: string | null = null;
  let completedAt: string | null = null;

  if (status === 'active') {
    startedAt = new Date().toISOString();
  } else if (status === 'completed') {
    completedAt = new Date().toISOString();
  }

  let sql = 'UPDATE trips SET status = ?';
  const params: any[] = [status];

  if (status === 'active') {
    sql += ', started_at = ?';
    params.push(startedAt);
  } else if (status === 'completed') {
    sql += ', completed_at = ?';
    params.push(completedAt);
  }

  if (status === 'ready') {
    try {
      const sizeMB = await getTripFileSizeMB(tripId);
      sql += ', total_size_mb = ?';
      params.push(sizeMB);
    } catch (e) {
      console.warn(`Failed to calculate file size for trip ${tripId}:`, e);
    }
  }

  sql += ' WHERE id = ?';
  params.push(tripId);

  await db.runAsync(sql, ...params);
}

/**
 * Saves POIs for a trip (bulk insert).
 *
 * @param tripId - The trip these POIs belong to
 * @param pois - Array of POI objects to persist
 *
 * Implementation notes:
 * - Use a transaction for atomicity
 * - Insert or replace to handle re-preparation scenarios
 * - Store coordinates as separate lat/lng columns (not JSON) for query efficiency
 */
export async function savePOIs(
  tripId: string,
  pois: POI[]
): Promise<void> {
  const db = await getDb();
  
  await db.withTransactionAsync(async () => {
    for (const poi of pois) {
      await db.runAsync(
        `INSERT OR REPLACE INTO pois (id, trip_id, name, category, lat, lng, rating, narration_text, narration_word_count, estimated_listen_minutes, audio_file_path, trigger_radius_meters, priority, image_url, image_local_path, bookmarked, played_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        poi.id,
        tripId,
        poi.name,
        poi.category,
        poi.coordinates.lat,
        poi.coordinates.lng,
        poi.rating,
        poi.narration_text,
        poi.narration_word_count,
        poi.estimated_listen_minutes,
        poi.audio_file_path,
        poi.trigger_radius_meters,
        poi.priority,
        poi.image_url,
        poi.image_local_path,
        poi.bookmarked ? 1 : 0,
        poi.played_at
      );
    }
  });
}

/**
 * Updates a single POI (e.g. bookmarks or played timestamp).
 */
export async function updatePOI(poi: POI): Promise<void> {
  const db = await getDb();
  
  await db.runAsync(
    `UPDATE pois
     SET name = ?, category = ?, lat = ?, lng = ?, rating = ?,
         narration_text = ?, narration_word_count = ?, estimated_listen_minutes = ?,
         audio_file_path = ?, trigger_radius_meters = ?, priority = ?,
         image_url = ?, image_local_path = ?, bookmarked = ?, played_at = ?
     WHERE id = ?`,
    poi.name,
    poi.category,
    poi.coordinates.lat,
    poi.coordinates.lng,
    poi.rating,
    poi.narration_text,
    poi.narration_word_count,
    poi.estimated_listen_minutes,
    poi.audio_file_path,
    poi.trigger_radius_meters,
    poi.priority,
    poi.image_url,
    poi.image_local_path,
    poi.bookmarked ? 1 : 0,
    poi.played_at,
    poi.id
  );
}

/**
 * Saves a single log entry.
 */
export async function addTripLogEntry(
  tripId: string,
  entry: TripLogEntry
): Promise<void> {
  const db = await getDb();
  
  await db.runAsync(
    `INSERT INTO trip_log (trip_id, poi_id, played_at, lat, lng, skipped)
     VALUES (?, ?, ?, ?, ?, ?)`,
    tripId,
    entry.poi_id,
    entry.played_at,
    entry.location.lat,
    entry.location.lng,
    entry.skipped ? 1 : 0
  );
}

/**
 * Saves a batch of trip log entries.
 *
 * @param tripId - The trip ID
 * @param entries - Array of TripLogEntry records
 */
export async function saveLogEntries(
  tripId: string,
  entries: TripLogEntry[]
): Promise<void> {
  const db = await getDb();
  
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      await db.runAsync(
        `INSERT INTO trip_log (trip_id, poi_id, played_at, lat, lng, skipped)
         VALUES (?, ?, ?, ?, ?, ?)`,
        tripId,
        entry.poi_id,
        entry.played_at,
        entry.location.lat,
        entry.location.lng,
        entry.skipped ? 1 : 0
      );
    }
  });
}

/**
 * Saves a single GPS breadcrumb.
 */
export async function addBreadcrumb(
  tripId: string,
  breadcrumb: GpsBreadcrumb
): Promise<void> {
  const db = await getDb();
  
  await db.runAsync(
    `INSERT INTO gps_breadcrumbs (trip_id, timestamp, lat, lng)
     VALUES (?, ?, ?, ?)`,
    tripId,
    breadcrumb.timestamp,
    breadcrumb.lat,
    breadcrumb.lng
  );
}

/**
 * Saves GPS breadcrumbs for a trip.
 *
 * @param tripId - The trip ID
 * @param breadcrumbs - Array of GpsBreadcrumb records
 */
export async function saveBreadcrumbs(
  tripId: string,
  breadcrumbs: GpsBreadcrumb[]
): Promise<void> {
  const db = await getDb();
  
  await db.withTransactionAsync(async () => {
    for (const breadcrumb of breadcrumbs) {
      await db.runAsync(
        `INSERT INTO gps_breadcrumbs (trip_id, timestamp, lat, lng)
         VALUES (?, ?, ?, ?)`,
        tripId,
        breadcrumb.timestamp,
        breadcrumb.lat,
        breadcrumb.lng
      );
    }
  });
}

/**
 * Retrieves the log entries for a trip.
 */
export async function getTripLog(tripId: string): Promise<TripLogEntry[]> {
  const db = await getDb();
  
  interface LogRow {
    poi_id: string;
    played_at: string;
    lat: number;
    lng: number;
    skipped: number;
  }
  
  const rows = await db.getAllAsync<LogRow>(
    `SELECT poi_id, played_at, lat, lng, skipped FROM trip_log WHERE trip_id = ? ORDER BY played_at ASC`,
    tripId
  );
  
  return rows.map((row) => ({
    poi_id: row.poi_id,
    played_at: row.played_at,
    location: {
      lat: row.lat,
      lng: row.lng,
    },
    skipped: row.skipped !== 0,
  }));
}

/**
 * Retrieves breadcrumbs for a trip.
 */
export async function getBreadcrumbs(tripId: string): Promise<GpsBreadcrumb[]> {
  const db = await getDb();
  
  interface BreadcrumbRow {
    timestamp: string;
    lat: number;
    lng: number;
  }
  
  const rows = await db.getAllAsync<BreadcrumbRow>(
    `SELECT timestamp, lat, lng FROM gps_breadcrumbs WHERE trip_id = ? ORDER BY timestamp ASC`,
    tripId
  );
  
  return rows.map((row) => ({
    timestamp: row.timestamp,
    lat: row.lat,
    lng: row.lng,
  }));
}

/**
 * Deletes a trip and all associated data (POIs, logs, breadcrumbs, files).
 *
 * @param tripId - The trip to delete
 *
 * Implementation notes:
 * - Use a transaction to delete from all related tables
 * - Also delete associated audio and image files from the filesystem
 *   (delegate to fileStorage.ts)
 * - This is a destructive operation — consider adding a confirmation step in the UI
 */
export async function deleteTrip(tripId: string): Promise<void> {
  const db = await getDb();
  
  await db.withTransactionAsync(async () => {
    // Relying on ON DELETE CASCADE since foreign keys are enabled
    await db.runAsync(`DELETE FROM trips WHERE id = ?`, tripId);
  });
  
  // Clean up files in filesystem
  try {
    await deleteTripFiles(tripId);
  } catch (error) {
    console.error(`Failed to clean up files for trip ${tripId}:`, error);
  }
}
