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

interface WebStore {
  apiaries: Apiary[];
  hives: Hive[];
  inspections: InspectionRecord[];
  nextApiaryId: number;
  nextHiveId: number;
  nextInspectionId: number;
}

const STORAGE_KEY = "smartbee_web_db_v1";

function loadStore(): WebStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as WebStore;
    }
  } catch {
    // Fallback to initial seed
  }

  const initial: WebStore = {
    apiaries: [
      { id: 1, name: "Main Apiary", latitude: 50.0647, longitude: 19.945 },
    ],
    hives: [
      { id: 1, apiary_id: 1, name: "Hive #1", hive_type: "Dadant" },
      { id: 2, apiary_id: 1, name: "Hive #2", hive_type: "Wielkopolski" },
    ],
    inspections: [],
    nextApiaryId: 2,
    nextHiveId: 3,
    nextInspectionId: 1,
  };
  saveStore(initial);
  return initial;
}

function saveStore(store: WebStore): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota errors in prototype
  }
}

export async function listApiaries(): Promise<Apiary[]> {
  return loadStore().apiaries;
}

export async function createApiary(
  name: string,
  latitude: number,
  longitude: number
): Promise<Apiary> {
  const store = loadStore();
  const created: Apiary = {
    id: store.nextApiaryId++,
    name: name.trim(),
    latitude,
    longitude,
  };
  store.apiaries.push(created);
  saveStore(store);
  return created;
}

export async function listHivesByApiary(apiaryId: number): Promise<Hive[]> {
  return loadStore().hives.filter((h) => h.apiary_id === apiaryId);
}

export async function createHive(
  apiaryId: number,
  name: string,
  hiveType = "Dadant"
): Promise<Hive> {
  const store = loadStore();
  const created: Hive = {
    id: store.nextHiveId++,
    apiary_id: apiaryId,
    name: name.trim(),
    hive_type: hiveType.trim() || "Dadant",
  };
  store.hives.push(created);
  saveStore(store);
  return created;
}

export async function createInspection(params: {
  hiveId: number;
  form: InspectionFormValues;
  weather?: InspectionWeatherSnapshot;
  ai?: InspectionAiSnapshot;
}): Promise<InspectionRecord> {
  const store = loadStore();
  const created: InspectionRecord = {
    id: store.nextInspectionId++,
    hive_id: params.hiveId,
    inspected_at: new Date().toISOString(),
    ...params.form,
    note: params.form.note.trim(),
    temperature_c: params.weather?.temperature_c ?? null,
    wind_speed_kmh: params.weather?.wind_speed_kmh ?? null,
    precipitation_mm: params.weather?.precipitation_mm ?? null,
    ai_summary: params.ai?.ai_summary ?? null,
    ai_risk_level: params.ai?.ai_risk_level ?? null,
  };
  store.inspections.unshift(created);
  saveStore(store);
  return created;
}

export async function listInspectionsByHive(
  hiveId: number
): Promise<InspectionRecord[]> {
  return loadStore().inspections.filter((item) => item.hive_id === hiveId);
}