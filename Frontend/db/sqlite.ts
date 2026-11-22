import * as SQLite from "expo-sqlite";
import {
  Apiary,
  buildInspectionPromptText,
  Hive,
  InspectionAiSnapshot,
  InspectionFormValues,
  InspectionRecord,
  InspectionWeatherSnapshot,
} from "./types";

export * from "./types";
export { buildInspectionPromptText };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("smartbee.db");
      await initSchema(db);
      return db;
    })();
  }
  return dbPromise;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS apiaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apiary_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      hive_type TEXT NOT NULL DEFAULT 'Dadant',
      FOREIGN KEY (apiary_id) REFERENCES apiaries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hive_id INTEGER NOT NULL,
      inspected_at TEXT NOT NULL,
      queen_seen TEXT NOT NULL,
      brood_status TEXT NOT NULL,
      stores_status TEXT NOT NULL,
      temperament TEXT NOT NULL,
      note TEXT NOT NULL,
      temperature_c REAL,
      wind_speed_kmh REAL,
      precipitation_mm REAL,
      ai_summary TEXT,
      ai_risk_level TEXT,
      FOREIGN KEY (hive_id) REFERENCES hives(id) ON DELETE CASCADE
    );
  `);

  const existingApiaries = await db.getAllAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM apiaries"
  );

  if ((existingApiaries[0]?.count ?? 0) === 0) {
    const apiaryResult = await db.runAsync(
      "INSERT INTO apiaries (name, latitude, longitude) VALUES (?, ?, ?)",
      "Main Apiary",
      50.0647,
      19.945
    );
    const apiaryId = apiaryResult.lastInsertRowId;

    await db.runAsync(
      "INSERT INTO hives (apiary_id, name, hive_type) VALUES (?, ?, ?), (?, ?, ?)",
      apiaryId,
      "Hive #1",
      "Dadant",
      apiaryId,
      "Hive #2",
      "Wielkopolski"
    );
  }
}

export async function listApiaries(): Promise<Apiary[]> {
  const db = await getDb();
  return db.getAllAsync<Apiary>("SELECT * FROM apiaries ORDER BY id ASC");
}

export async function createApiary(
  name: string,
  latitude: number,
  longitude: number
): Promise<Apiary> {
  const db = await getDb();
  const res = await db.runAsync(
    "INSERT INTO apiaries (name, latitude, longitude) VALUES (?, ?, ?)",
    name.trim(),
    latitude,
    longitude
  );
  return {
    id: res.lastInsertRowId,
    name: name.trim(),
    latitude,
    longitude,
  };
}

export async function listHivesByApiary(apiaryId: number): Promise<Hive[]> {
  const db = await getDb();
  return db.getAllAsync<Hive>(
    "SELECT * FROM hives WHERE apiary_id = ? ORDER BY id ASC",
    apiaryId
  );
}

export async function createHive(
  apiaryId: number,
  name: string,
  hiveType = "Dadant"
): Promise<Hive> {
  const db = await getDb();
  const cleanType = hiveType.trim() || "Dadant";
  const res = await db.runAsync(
    "INSERT INTO hives (apiary_id, name, hive_type) VALUES (?, ?, ?)",
    apiaryId,
    name.trim(),
    cleanType
  );
  return {
    id: res.lastInsertRowId,
    apiary_id: apiaryId,
    name: name.trim(),
    hive_type: cleanType,
  };
}

export async function createInspection(params: {
  hiveId: number;
  form: InspectionFormValues;
  weather?: InspectionWeatherSnapshot;
  ai?: InspectionAiSnapshot;
}): Promise<InspectionRecord> {
  const db = await getDb();
  const inspectedAt = new Date().toISOString();
  const temp = params.weather?.temperature_c ?? null;
  const wind = params.weather?.wind_speed_kmh ?? null;
  const precip = params.weather?.precipitation_mm ?? null;
  const aiSummary = params.ai?.ai_summary ?? null;
  const aiRisk = params.ai?.ai_risk_level ?? null;

  const res = await db.runAsync(
    `INSERT INTO inspections (
      hive_id,
      inspected_at,
      queen_seen,
      brood_status,
      stores_status,
      temperament,
      note,
      temperature_c,
      wind_speed_kmh,
      precipitation_mm,
      ai_summary,
      ai_risk_level
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params.hiveId,
    inspectedAt,
    params.form.queen_seen,
    params.form.brood_status,
    params.form.stores_status,
    params.form.temperament,
    params.form.note.trim(),
    temp,
    wind,
    precip,
    aiSummary,
    aiRisk
  );

  return {
    id: res.lastInsertRowId,
    hive_id: params.hiveId,
    inspected_at: inspectedAt,
    ...params.form,
    note: params.form.note.trim(),
    temperature_c: temp,
    wind_speed_kmh: wind,
    precipitation_mm: precip,
    ai_summary: aiSummary,
    ai_risk_level: aiRisk,
  };
}

export async function listInspectionsByHive(
  hiveId: number
): Promise<InspectionRecord[]> {
  const db = await getDb();
  return db.getAllAsync<InspectionRecord>(
    "SELECT * FROM inspections WHERE hive_id = ? ORDER BY id DESC",
    hiveId
  );
}