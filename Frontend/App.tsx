import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Apiary,
  buildInspectionPromptText,
  createApiary,
  createHive,
  createInspection,
  Hive,
  InspectionFormValues,
  InspectionRecord,
  listApiaries,
  listHivesByApiary,
  listInspectionsByHive,
} from "./db/sqlite";

const API_BASE_URL = "http://127.0.0.1:8000";

interface WeatherReport {
  latitude: number;
  longitude: number;
  temperature_c: number;
  wind_speed_kmh: number;
  precipitation_mm: number;
  weather_code: number;
  observed_at: string;
}

interface HiveNoteAnalysisResponse {
  summary: string;
  risk_level: string;
  recommended_actions: string[];
  weather_impact: string;
}

const QUEEN_OPTIONS: InspectionFormValues["queen_seen"][] = [
  "yes",
  "no",
  "unknown",
];
const BROOD_OPTIONS: InspectionFormValues["brood_status"][] = [
  "healthy",
  "sparse",
  "none",
  "issue",
];
const STORES_OPTIONS: InspectionFormValues["stores_status"][] = [
  "high",
  "medium",
  "low",
];
const TEMPERAMENT_OPTIONS: InspectionFormValues["temperament"][] = [
  "calm",
  "agitated",
  "defensive",
];

function OptionSelector<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.optionsRow}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.optionBtn, active && styles.optionBtnActive]}
              onPress={() => onChange(opt)}
            >
              <Text
                style={[styles.optionText, active && styles.optionTextActive]}
              >
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"hives" | "inspection">("hives");

  const [apiaries, setApiaries] = useState<Apiary[]>([]);
  const [selectedApiaryId, setSelectedApiaryId] = useState<number | null>(null);
  const [hives, setHives] = useState<Hive[]>([]);
  const [selectedHiveId, setSelectedHiveId] = useState<number | null>(null);
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);

  // New apiary & hive inputs
  const [newApiaryName, setNewApiaryName] = useState("");
  const [latitude, setLatitude] = useState("50.0647");
  const [longitude, setLongitude] = useState("19.945");
  const [newHiveName, setNewHiveName] = useState("");
  const [newHiveType, setNewHiveType] = useState("Dadant");

  // Inspection form + free note
  const [queenSeen, setQueenSeen] =
    useState<InspectionFormValues["queen_seen"]>("unknown");
  const [broodStatus, setBroodStatus] =
    useState<InspectionFormValues["brood_status"]>("healthy");
  const [storesStatus, setStoresStatus] =
    useState<InspectionFormValues["stores_status"]>("medium");
  const [temperament, setTemperament] =
    useState<InspectionFormValues["temperament"]>("calm");
  const [note, setNote] = useState("");

  const [weather, setWeather] = useState<WeatherReport | null>(null);
  const [analysis, setAnalysis] = useState<HiveNoteAnalysisResponse | null>(
    null
  );

  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [isSubmittingInspection, setIsSubmittingInspection] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const extractApiError = async (response: Response): Promise<string> => {
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") {
        return data.detail;
      }
      if (Array.isArray(data?.detail)) {
        return data.detail
          .map((item: { msg?: string }) => item.msg ?? "Validation error")
          .join("; ");
      }
    } catch {
      // Fallback to HTTP status
    }
    return `Request failed with status ${response.status}.`;
  };

  const fetchWeatherForCoords = useCallback(
    async (lat: number, lon: number, silent = false) => {
      if (!silent) {
        setErrorMessage(null);
        setStatusMessage(null);
      }
      setIsLoadingWeather(true);
      try {
        const url = `${API_BASE_URL}/weather?lat=${lat}&lon=${lon}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(await extractApiError(response));
        }
        const data: WeatherReport = await response.json();
        setWeather(data);
      } catch (error) {
        setWeather(null);
        if (!silent) {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to fetch weather."
          );
        }
      } finally {
        setIsLoadingWeather(false);
      }
    },
    []
  );

  const loadInspections = useCallback(async (hiveId: number | null) => {
    if (!hiveId) {
      setInspections([]);
      return;
    }
    const rows = await listInspectionsByHive(hiveId);
    setInspections(rows);
  }, []);

  const loadHivesForApiary = useCallback(
    async (apiaryId: number | null, preferredHiveId?: number | null) => {
      if (!apiaryId) {
        setHives([]);
        setSelectedHiveId(null);
        setInspections([]);
        return;
      }
      const rows = await listHivesByApiary(apiaryId);
      setHives(rows);

      const nextHiveId =
        preferredHiveId && rows.some((h) => h.id === preferredHiveId)
          ? preferredHiveId
          : rows[0]?.id ?? null;

      setSelectedHiveId(nextHiveId);
      await loadInspections(nextHiveId);
    },
    [loadInspections]
  );

  const initData = useCallback(async () => {
    try {
      const rows = await listApiaries();
      setApiaries(rows);
      if (rows.length > 0) {
        const first = rows[0];
        setSelectedApiaryId(first.id);
        setLatitude(String(first.latitude));
        setLongitude(String(first.longitude));
        await loadHivesForApiary(first.id);
        await fetchWeatherForCoords(first.latitude, first.longitude, true);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to initialize storage."
      );
    }
  }, [fetchWeatherForCoords, loadHivesForApiary]);

  useEffect(() => {
    initData();
  }, [initData]);

  const handleSelectApiary = async (apiary: Apiary) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setSelectedApiaryId(apiary.id);
    setLatitude(String(apiary.latitude));
    setLongitude(String(apiary.longitude));
    setWeather(null);
    setAnalysis(null);
    await loadHivesForApiary(apiary.id);
    await fetchWeatherForCoords(apiary.latitude, apiary.longitude, true);
  };

  const handleSelectHive = async (hiveId: number, switchToInspection = false) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setSelectedHiveId(hiveId);
    setAnalysis(null);
    await loadInspections(hiveId);
    if (switchToInspection) {
      setActiveTab("inspection");
    }
  };

  const parseCoordinates = (): { lat: number; lon: number } | null => {
    const lat = Number(latitude.trim().replace(",", "."));
    const lon = Number(longitude.trim().replace(",", "."));

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setErrorMessage("Enter valid numeric latitude and longitude.");
      return null;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setErrorMessage(
        "Coordinates out of range: latitude must be -90..90, longitude -180..180."
      );
      return null;
    }
    return { lat, lon };
  };

  const handleAddApiary = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    const cleanName = newApiaryName.trim();
    if (!cleanName) {
      setErrorMessage("Enter an apiary name.");
      return;
    }
    const coords = parseCoordinates();
    if (!coords) return;

    const created = await createApiary(cleanName, coords.lat, coords.lon);
    const updated = await listApiaries();
    setApiaries(updated);
    setSelectedApiaryId(created.id);
    setNewApiaryName("");
    setWeather(null);
    await loadHivesForApiary(created.id);
    await fetchWeatherForCoords(created.latitude, created.longitude, true);
    setStatusMessage(`Created apiary "${created.name}".`);
  };

  const handleAddHive = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (!selectedApiaryId) {
      setErrorMessage("Select an apiary first.");
      return;
    }
    const cleanName = newHiveName.trim();
    if (!cleanName) {
      setErrorMessage("Enter a hive name or number.");
      return;
    }

    const created = await createHive(selectedApiaryId, cleanName, newHiveType);
    setNewHiveName("");
    await loadHivesForApiary(selectedApiaryId, created.id);
    setStatusMessage(`Added "${created.name}" to the selected apiary.`);
  };

  const handleManualWeatherRefresh = async () => {
    const coords = parseCoordinates();
    if (!coords) return;
    await fetchWeatherForCoords(coords.lat, coords.lon, false);
  };

  const currentApiary =
    apiaries.find((a) => a.id === selectedApiaryId) ?? null;
  const currentHive = hives.find((h) => h.id === selectedHiveId) ?? null;

  const getFormValues = (): InspectionFormValues => ({
    queen_seen: queenSeen,
    brood_status: broodStatus,
    stores_status: storesStatus,
    temperament,
    note: note.trim(),
  });

  const handleSaveOnly = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (!currentHive) {
      setErrorMessage("Select or create a hive before saving an inspection.");
      return;
    }

    const form = getFormValues();
    if (!form.note) {
      setErrorMessage("Enter a note or observations for the inspection.");
      return;
    }

    setIsSubmittingInspection(true);
    try {
      await createInspection({
        hiveId: currentHive.id,
        form,
        weather: weather
          ? {
              temperature_c: weather.temperature_c,
              wind_speed_kmh: weather.wind_speed_kmh,
              precipitation_mm: weather.precipitation_mm,
            }
          : undefined,
      });
      setNote("");
      await loadInspections(currentHive.id);
      setStatusMessage(`Saved inspection for ${currentHive.name}.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save inspection."
      );
    } finally {
      setIsSubmittingInspection(false);
    }
  };

  const handleAnalyzeAndSave = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (!currentHive) {
      setErrorMessage("Select or create a hive before running AI analysis.");
      return;
    }

    const form = getFormValues();
    if (!form.note) {
      setErrorMessage("Enter a note before running AI analysis.");
      return;
    }

    setIsSubmittingInspection(true);
    try {
      const promptText = buildInspectionPromptText(currentHive.name, form);
      const body: Record<string, unknown> = { note: promptText };
      if (weather) {
        body.temperature_c = weather.temperature_c;
        body.wind_speed_kmh = weather.wind_speed_kmh;
        body.precipitation_mm = weather.precipitation_mm;
      }

      const response = await fetch(`${API_BASE_URL}/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(await extractApiError(response));
      }

      const aiData: HiveNoteAnalysisResponse = await response.json();
      setAnalysis(aiData);

      await createInspection({
        hiveId: currentHive.id,
        form,
        weather: weather
          ? {
              temperature_c: weather.temperature_c,
              wind_speed_kmh: weather.wind_speed_kmh,
              precipitation_mm: weather.precipitation_mm,
            }
          : undefined,
        ai: {
          ai_summary: aiData.summary,
          ai_risk_level: aiData.risk_level,
        },
      });

      setNote("");
      await loadInspections(currentHive.id);
      setStatusMessage(`AI analysis saved for ${currentHive.name}.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to analyze and save inspection."
      );
    } finally {
      setIsSubmittingInspection(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>SmartBee</Text>
        <Text style={styles.activeBadge} numberOfLines={1}>
          {currentApiary && currentHive
            ? `${currentApiary.name} · ${currentHive.name}${
                weather ? ` · ${weather.temperature_c} °C` : ""
              }`
            : "No hive selected"}
        </Text>
      </View>

      {/* Top Navigation Tabs */}
      <View style={styles.tabsBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "hives" && styles.tabBtnActive]}
          onPress={() => setActiveTab("hives")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "hives" && styles.tabTextActive,
            ]}
          >
            Apiaries & Hives ({hives.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabBtn,
            activeTab === "inspection" && styles.tabBtnActive,
          ]}
          onPress={() => setActiveTab("inspection")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "inspection" && styles.tabTextActive,
            ]}
          >
            Inspection & AI
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {statusMessage && (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{statusMessage}</Text>
          </View>
        )}

        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {activeTab === "hives" ? (
          <>
            {/* Apiary List */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Apiaries</Text>
              <Text style={styles.hint}>
                Tap an apiary to load its hives and current temperature.
              </Text>

              <View style={styles.listStack}>
                {apiaries.map((apiary) => {
                  const selected = apiary.id === selectedApiaryId;
                  return (
                    <TouchableOpacity
                      key={apiary.id}
                      style={[
                        styles.selectableRow,
                        selected && styles.selectableRowSelected,
                      ]}
                      onPress={() => handleSelectApiary(apiary)}
                    >
                      <View style={styles.flexOne}>
                        <Text
                          style={[
                            styles.rowTitle,
                            selected && styles.rowTitleSelected,
                          ]}
                        >
                          {selected ? "● " : ""}
                          {apiary.name}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {apiary.latitude.toFixed(4)},{" "}
                          {apiary.longitude.toFixed(4)}
                          {selected && weather
                            ? ` · Wind ${weather.wind_speed_kmh} km/h`
                            : ""}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.badgePill,
                          selected && styles.badgePillSelected,
                        ]}
                      >
                        {selected
                          ? isLoadingWeather
                            ? "..."
                            : weather
                              ? `${weather.temperature_c} °C`
                              : "Selected"
                          : "Open"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.divider} />
              <Text style={styles.subHeading}>Add New Apiary</Text>
              <TextInput
                style={styles.input}
                value={newApiaryName}
                onChangeText={setNewApiaryName}
                placeholder="Apiary name (e.g. Meadow Apiary)"
              />
              <View style={styles.row}>
                <View style={styles.flexOne}>
                  <Text style={styles.fieldLabel}>Latitude</Text>
                  <TextInput
                    style={styles.input}
                    value={latitude}
                    onChangeText={setLatitude}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.fieldLabel}>Longitude</Text>
                  <TextInput
                    style={styles.input}
                    value={longitude}
                    onChangeText={setLongitude}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleAddApiary}
              >
                <Text style={styles.secondaryBtnText}>+ Create Apiary</Text>
              </TouchableOpacity>
            </View>

            {/* Hive List for Selected Apiary */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                Hives in {currentApiary ? currentApiary.name : "Apiary"}
              </Text>
              <Text style={styles.hint}>
                Tap "Inspect" on a hive to run an AI inspection for that hive.
              </Text>

              {hives.length === 0 ? (
                <Text style={styles.emptyText}>
                  No hives in this apiary yet. Add one below.
                </Text>
              ) : (
                <View style={styles.listStack}>
                  {hives.map((hive) => {
                    const selected = hive.id === selectedHiveId;
                    return (
                      <View
                        key={hive.id}
                        style={[
                          styles.hiveRow,
                          selected && styles.hiveRowSelected,
                        ]}
                      >
                        <TouchableOpacity
                          style={styles.flexOne}
                          onPress={() => handleSelectHive(hive.id, false)}
                        >
                          <Text style={styles.rowTitle}>
                            {selected ? "✓ " : ""}
                            {hive.name}
                          </Text>
                          <Text style={styles.rowMeta}>
                            Type: {hive.hive_type}
                            {weather ? ` · ${weather.temperature_c} °C` : ""}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.inspectBtn}
                          onPress={() => handleSelectHive(hive.id, true)}
                        >
                          <Text style={styles.inspectBtnText}>Inspect</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.divider} />
              <Text style={styles.subHeading}>Add Hive to Current Apiary</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.flexOne]}
                  value={newHiveName}
                  onChangeText={setNewHiveName}
                  placeholder="Hive name (e.g. Hive #3)"
                />
                <TextInput
                  style={[styles.input, styles.typeInput]}
                  value={newHiveType}
                  onChangeText={setNewHiveType}
                  placeholder="Dadant"
                />
              </View>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleAddHive}
              >
                <Text style={styles.secondaryBtnText}>+ Add Hive</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* Active Target + Weather */}
            <View style={styles.sectionCard}>
              <View style={styles.targetHeader}>
                <View style={styles.flexOne}>
                  <Text style={styles.sectionTitle}>
                    {currentHive ? currentHive.name : "No hive selected"}
                  </Text>
                  <Text style={styles.rowMeta}>
                    Apiary: {currentApiary?.name ?? "—"} · Type:{" "}
                    {currentHive?.hive_type ?? "—"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => setActiveTab("hives")}
                >
                  <Text style={styles.linkBtnText}>Change Hive</Text>
                </TouchableOpacity>
              </View>

              {weather ? (
                <View style={styles.weatherBox}>
                  <Text style={styles.weatherText}>
                    {weather.temperature_c} °C · Wind {weather.wind_speed_kmh}{" "}
                    km/h · Rain {weather.precipitation_mm} mm
                  </Text>
                </View>
              ) : (
                <Text style={styles.hint}>
                  Weather not loaded yet (offline or backend unavailable).
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  isLoadingWeather && styles.btnDisabled,
                ]}
                onPress={handleManualWeatherRefresh}
                disabled={isLoadingWeather || isSubmittingInspection}
              >
                {isLoadingWeather ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Refresh Weather</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Inspection Form + Free Note */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Inspection Form</Text>

              <OptionSelector
                label="Queen seen"
                options={QUEEN_OPTIONS}
                value={queenSeen}
                onChange={setQueenSeen}
              />
              <OptionSelector
                label="Brood status"
                options={BROOD_OPTIONS}
                value={broodStatus}
                onChange={setBroodStatus}
              />
              <OptionSelector
                label="Stores status"
                options={STORES_OPTIONS}
                value={storesStatus}
                onChange={setStoresStatus}
              />
              <OptionSelector
                label="Temperament"
                options={TEMPERAMENT_OPTIONS}
                value={temperament}
                onChange={setTemperament}
              />

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Additional Note</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Write observations, frames checked, varroa or feeding notes..."
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.aiBtn,
                  (isSubmittingInspection || isLoadingWeather) &&
                    styles.btnDisabled,
                ]}
                onPress={handleAnalyzeAndSave}
                disabled={isSubmittingInspection || isLoadingWeather}
              >
                {isSubmittingInspection ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Analyze with AI & Save</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  (isSubmittingInspection || isLoadingWeather) &&
                    styles.btnDisabled,
                ]}
                onPress={handleSaveOnly}
                disabled={isSubmittingInspection || isLoadingWeather}
              >
                <Text style={styles.secondaryBtnText}>Save Without AI</Text>
              </TouchableOpacity>
            </View>

            {analysis && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>
                  AI Result · Risk: {analysis.risk_level.toUpperCase()}
                </Text>
                <Text style={styles.bodyText}>{analysis.summary}</Text>
                <Text style={styles.subHeading}>Weather Impact</Text>
                <Text style={styles.bodyText}>{analysis.weather_impact}</Text>
                <Text style={styles.subHeading}>Recommended Actions</Text>
                {analysis.recommended_actions.map((act, idx) => (
                  <Text key={`${idx}-${act}`} style={styles.bodyText}>
                    • {act}
                  </Text>
                ))}
              </View>
            )}

            {/* Selected Hive History */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                Hive History ({inspections.length})
              </Text>
              {inspections.length === 0 ? (
                <Text style={styles.emptyText}>
                  No inspections saved for this hive yet.
                </Text>
              ) : (
                inspections.map((item) => (
                  <View key={item.id} style={styles.historyCard}>
                    <Text style={styles.historyDate}>
                      {new Date(item.inspected_at).toLocaleString()}
                    </Text>
                    <Text style={styles.bodyText}>
                      Queen: <Text style={styles.bold}>{item.queen_seen}</Text>{" "}
                      · Brood:{" "}
                      <Text style={styles.bold}>{item.brood_status}</Text> ·
                      Stores:{" "}
                      <Text style={styles.bold}>{item.stores_status}</Text> ·
                      Temp.:{" "}
                      <Text style={styles.bold}>{item.temperament}</Text>
                    </Text>
                    {item.note ? (
                      <Text style={styles.bodyText}>Note: {item.note}</Text>
                    ) : null}
                    {item.temperature_c !== null && (
                      <Text style={styles.rowMeta}>
                        Weather: {item.temperature_c} °C, wind{" "}
                        {item.wind_speed_kmh} km/h, rain {item.precipitation_mm}{" "}
                        mm
                      </Text>
                    )}
                    {item.ai_summary && (
                      <Text style={styles.aiNote}>
                        AI [{item.ai_risk_level ?? "n/a"}]: {item.ai_summary}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  header: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  activeBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f766e",
    backgroundColor: "#ccfbf1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    maxWidth: "68%",
  },
  tabsBar: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  tabBtnActive: {
    backgroundColor: "#111827",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  container: {
    padding: 14,
    gap: 14,
  },
  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  subHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1f2937",
    marginTop: 2,
  },
  hint: {
    fontSize: 13,
    color: "#6b7280",
  },
  emptyText: {
    fontSize: 13,
    color: "#6b7280",
    fontStyle: "italic",
  },
  listStack: {
    gap: 8,
  },
  selectableRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fafafa",
  },
  selectableRowSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  hiveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fafafa",
    gap: 10,
  },
  hiveRowSelected: {
    borderColor: "#0f766e",
    backgroundColor: "#f0fdfa",
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  rowTitleSelected: {
    color: "#1d4ed8",
  },
  rowMeta: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  badgePill: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4b5563",
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgePillSelected: {
    color: "#ffffff",
    backgroundColor: "#2563eb",
  },
  inspectBtn: {
    backgroundColor: "#0f766e",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  inspectBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 4,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
  },
  flexOne: {
    flex: 1,
  },
  typeInput: {
    width: 96,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  textArea: {
    minHeight: 76,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  optionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
  },
  optionBtnActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#1d4ed8",
  },
  optionText: {
    fontSize: 13,
    color: "#374151",
  },
  optionTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  targetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  linkBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  linkBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  primaryBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: "center",
  },
  aiBtn: {
    backgroundColor: "#0f766e",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryBtn: {
    backgroundColor: "#e5e7eb",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryBtnText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
  },
  weatherBox: {
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    padding: 10,
  },
  weatherText: {
    fontSize: 13,
    color: "#1e3a8a",
    fontWeight: "600",
  },
  bodyText: {
    fontSize: 14,
    color: "#1f2937",
    lineHeight: 20,
  },
  bold: {
    fontWeight: "700",
  },
  infoBox: {
    backgroundColor: "#ecfdf5",
    borderColor: "#6ee7b7",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  infoText: {
    fontSize: 13,
    color: "#065f46",
    fontWeight: "600",
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#991b1b",
  },
  errorText: {
    fontSize: 13,
    color: "#7f1d1d",
  },
  historyCard: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 10,
    gap: 4,
  },
  historyDate: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4b5563",
  },
  aiNote: {
    fontSize: 13,
    color: "#0f766e",
    fontWeight: "500",
  },
});