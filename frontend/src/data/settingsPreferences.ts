// Frontend-only preferences.
// No backend job or Gmail settings are changed here.

export type RetentionPeriod = "30" | "90" | "365";

export type SettingsPreferences = {
  automaticScanning: boolean;
  showLearningSuggestions: boolean;
  threatAlerts: boolean;
  weeklyDigest: boolean;
  retentionDays: RetentionPeriod;
};

export const defaultSettings: SettingsPreferences = {
  automaticScanning: false,
  showLearningSuggestions: true,
  threatAlerts: true,
  weeklyDigest: false,
  retentionDays: "90",
};

const STORAGE_KEY = "inboxguard.settings.preview.v1";

export function loadSettings(): SettingsPreferences {
  if (typeof window === "undefined") {
    return { ...defaultSettings };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) return { ...defaultSettings };

    const value: unknown = JSON.parse(raw);

    if (!value || typeof value !== "object") {
      return { ...defaultSettings };
    }

    const stored = value as Partial<
      Record<keyof SettingsPreferences, unknown>
    >;

    const booleanSetting = (
      key:
        | "automaticScanning"
        | "showLearningSuggestions"
        | "threatAlerts"
        | "weeklyDigest"
    ): boolean =>
      typeof stored[key] === "boolean"
        ? stored[key]
        : defaultSettings[key];

    return {
      automaticScanning: booleanSetting("automaticScanning"),
      showLearningSuggestions: booleanSetting(
        "showLearningSuggestions"
      ),
      threatAlerts: booleanSetting("threatAlerts"),
      weeklyDigest: booleanSetting("weeklyDigest"),
      retentionDays:
        stored.retentionDays === "30" ||
        stored.retentionDays === "90" ||
        stored.retentionDays === "365"
          ? stored.retentionDays
          : defaultSettings.retentionDays,
    };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(
  preferences: SettingsPreferences
): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(preferences)
    );
    return true;
  } catch {
    return false;
  }
}