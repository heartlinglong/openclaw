const KEY = "agenthr.hr_core.settings.v1";

export type HrCoreSettings = {
  baseUrl: string;
  token: string;
};

export function loadHrCoreSettings(): HrCoreSettings {
  const defaults: HrCoreSettings = {
    baseUrl: "http://127.0.0.1:3001",
    token: "",
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<HrCoreSettings>;
    return {
      baseUrl:
        typeof parsed.baseUrl === "string" && parsed.baseUrl.trim()
          ? parsed.baseUrl.trim()
          : defaults.baseUrl,
      token: typeof parsed.token === "string" ? parsed.token : defaults.token,
    };
  } catch {
    return defaults;
  }
}

export function saveHrCoreSettings(next: HrCoreSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
}
