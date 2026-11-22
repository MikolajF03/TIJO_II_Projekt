export interface Apiary {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

export interface Hive {
  id: number;
  apiary_id: number;
  name: string;
  hive_type: string;
}

export interface InspectionFormValues {
  queen_seen: "yes" | "no" | "unknown";
  brood_status: "healthy" | "sparse" | "none" | "issue";
  stores_status: "high" | "medium" | "low";
  temperament: "calm" | "agitated" | "defensive";
  note: string;
}

export interface InspectionWeatherSnapshot {
  temperature_c: number | null;
  wind_speed_kmh: number | null;
  precipitation_mm: number | null;
}

export interface InspectionAiSnapshot {
  ai_summary: string | null;
  ai_risk_level: string | null;
}

export interface InspectionRecord extends InspectionFormValues {
  id: number;
  hive_id: number;
  inspected_at: string;
  temperature_c: number | null;
  wind_speed_kmh: number | null;
  precipitation_mm: number | null;
  ai_summary: string | null;
  ai_risk_level: string | null;
}

export function buildInspectionPromptText(
  hiveName: string,
  form: InspectionFormValues
): string {
  const cleanNote = form.note.trim();
  const parts = [
    `Hive: ${hiveName}`,
    `Queen seen: ${form.queen_seen}`,
    `Brood status: ${form.brood_status}`,
    `Stores status: ${form.stores_status}`,
    `Temperament: ${form.temperament}`,
  ];
  if (cleanNote) {
    parts.push(`Inspector note: ${cleanNote}`);
  }
  return parts.join("; ");
}