const KEY = "agenthr.hr_core.settings.v1";

export type HrCoreSettings = {
  baseUrl: string;
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
  } | null;
};

export function loadHrCoreSettings(): HrCoreSettings {
  const defaults: HrCoreSettings = {
    baseUrl: "http://127.0.0.1:3001",
    token: "",
    user: null,
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
      user:
        parsed.user &&
        typeof parsed.user === "object" &&
        typeof (parsed.user as any).id === "string" &&
        typeof (parsed.user as any).username === "string" &&
        typeof (parsed.user as any).role === "string"
          ? {
              id: String((parsed.user as any).id),
              username: String((parsed.user as any).username),
              role: String((parsed.user as any).role),
            }
          : defaults.user,
    };
  } catch {
    return defaults;
  }
}

export function saveHrCoreSettings(next: HrCoreSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
}
