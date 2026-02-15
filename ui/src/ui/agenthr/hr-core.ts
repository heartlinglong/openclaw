import type { HrCoreSettings } from "./hr-core-storage.ts";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export class HrCoreHttpError extends Error {
  status: number;
  statusText: string;
  path: string;
  constructor(message: string, opts: { status: number; statusText: string; path: string }) {
    super(message);
    this.name = "HrCoreHttpError";
    this.status = opts.status;
    this.statusText = opts.statusText;
    this.path = opts.path;
  }
}

export type HrCoreUser = {
  id: string;
  username: string;
  role: string;
};

export type HrCoreLoginResult = {
  token: string;
  user: HrCoreUser;
};

export type HrCoreEvent = {
  id: string;
  code: string;
  type: string;
  status: string;
  payload: JsonValue;
  employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type HrCoreHireIntakeValidateResponse = {
  ok_to_create: boolean;
  missing_required: Array<{ key: string; label: string }>;
  missing_optional: Array<{ key: string; label: string }>;
  next_action: string;
  confirmation_preview: {
    scene: "hire_confirmation";
    emp_no: {
      value: string | null;
      display: string;
      source: "provided" | "to_be_assigned_on_effective";
    };
    profile: {
      legal_name: string | null;
      primary_phone: string | null;
      primary_email: string | null;
    };
    employment: {
      legal_entity_code: string | null;
      legal_entity_name: string | null;
      hire_date: string | null;
      regularization_date: string | null;
      reason_code: string | null;
      reason_name?: string | null;
    };
    job_info: {
      org_unit_code: string | null;
      org_unit_name: string | null;
      position_code: string | null;
      position_name: string | null;
      manager_username: string | null;
      manager_display_name: string | null;
      org_chain_text: string | null;
    };
  };
};

export type HrCoreSearchResult = {
  q: string;
  employees: Array<{
    id: string;
    emp_no: string;
    legal_name: string | null;
    primary_phone: string | null;
    primary_email: string | null;
    org_unit: { code: string; name: string } | null;
    position: { code: string; name: string } | null;
  }>;
  org_units: Array<{ code: string; name: string; type: string }>;
  positions: Array<{ code: string; name: string; org_unit: { code: string; name: string } }>;
  legal_entities: Array<{ code: string; name: string; country: string }>;
};

export type HrCoreOrgUnit = { code: string; name: string; type: string; parentCode: string | null };

export type HrCoreEmployee = {
  id: string;
  emp_no: string;
  status: string;
  profile: {
    legal_name: string;
    primary_phone: string | null;
    primary_email: string | null;
  } | null;
  employment: {
    hire_date: string;
    regularization_date: string | null;
    termination_date: string | null;
    legal_entity: { code: string; name: string };
  } | null;
  job_info: {
    org_unit: { code: string; name: string };
    position: { code: string; name: string };
    manager_user: { id: string; username: string; display_name: string } | null;
  } | null;
};

export type HrCoreLegalEntity = {
  code: string;
  name: string;
  country: string;
  status: string;
  effective_start_date: string;
  effective_end_date: string | null;
};

export type HrCorePosition = {
  code: string;
  name: string;
  org_unit: { code: string; name: string };
  status: string;
  effective_start_date: string;
  effective_end_date: string | null;
};

export type HrCoreEmployeeListItem = HrCoreEmployee;

function joinUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

async function requestJson<T>(
  settings: HrCoreSettings,
  opts: { method: "GET" | "POST"; path: string; token?: string; body?: JsonValue },
): Promise<T> {
  const url = joinUrl(settings.baseUrl, opts.path);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = (opts.token ?? settings.token ?? "").trim();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method: opts.method,
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HrCoreHttpError(
      `${opts.method} ${opts.path} failed: ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
      { status: res.status, statusText: res.statusText, path: opts.path },
    );
  }
  return (await res.json()) as T;
}

export async function hrCoreLogin(
  settings: HrCoreSettings,
  username: string,
  password: string,
): Promise<HrCoreLoginResult> {
  return requestJson<HrCoreLoginResult>(settings, {
    method: "POST",
    path: "/api/v1/auth/login",
    // Avoid sending any stale Authorization header when logging in.
    token: "",
    body: { username, password },
  });
}

export async function hrCoreSearch(settings: HrCoreSettings, q: string, limit = 10) {
  const qs = new URLSearchParams({ q, limit: String(limit) }).toString();
  return requestJson<HrCoreSearchResult>(settings, {
    method: "GET",
    path: `/api/v1/search?${qs}`,
  });
}

export async function hrCoreListOrgUnits(settings: HrCoreSettings) {
  return requestJson<HrCoreOrgUnit[]>(settings, { method: "GET", path: "/api/v1/org-units" });
}

export async function hrCoreListPositions(settings: HrCoreSettings, orgUnitCode?: string) {
  const qs = orgUnitCode
    ? `?${new URLSearchParams({ org_unit_code: orgUnitCode }).toString()}`
    : "";
  return requestJson<HrCorePosition[]>(settings, { method: "GET", path: `/api/v1/positions${qs}` });
}

export async function hrCoreListLegalEntities(settings: HrCoreSettings) {
  return requestJson<HrCoreLegalEntity[]>(settings, {
    method: "GET",
    path: "/api/v1/legal-entities",
  });
}

export async function hrCoreListEmployees(
  settings: HrCoreSettings,
  filters?: {
    q?: string;
    emp_no?: string;
    manager_username?: string;
    org_unit_code?: string;
    position_code?: string;
    legal_entity_code?: string;
    limit?: number;
  },
) {
  const params = new URLSearchParams();
  if (filters?.q && filters.q.trim()) {
    params.set("q", filters.q.trim());
  }
  if (filters?.emp_no && filters.emp_no.trim()) {
    params.set("emp_no", filters.emp_no.trim());
  }
  if (filters?.manager_username && filters.manager_username.trim()) {
    params.set("manager_username", filters.manager_username.trim());
  }
  if (filters?.org_unit_code && filters.org_unit_code.trim()) {
    params.set("org_unit_code", filters.org_unit_code.trim());
  }
  if (filters?.position_code && filters.position_code.trim()) {
    params.set("position_code", filters.position_code.trim());
  }
  if (filters?.legal_entity_code && filters.legal_entity_code.trim()) {
    params.set("legal_entity_code", filters.legal_entity_code.trim());
  }
  params.set("limit", String(filters?.limit ?? 50));
  const qs = params.toString();
  return requestJson<HrCoreEmployeeListItem[]>(settings, {
    method: "GET",
    path: `/api/v1/employees${qs ? `?${qs}` : ""}`,
  });
}

export async function hrCoreGetOrgUnit(settings: HrCoreSettings, code: string) {
  return requestJson<HrCoreOrgUnit>(settings, {
    method: "GET",
    path: `/api/v1/org-units/${encodeURIComponent(code)}`,
  });
}

export async function hrCoreGetEmployee(settings: HrCoreSettings, empNo: string) {
  return requestJson<HrCoreEmployee>(settings, {
    method: "GET",
    path: `/api/v1/employees/${encodeURIComponent(empNo)}`,
  });
}

export async function hrCoreGetLegalEntity(settings: HrCoreSettings, code: string) {
  return requestJson<HrCoreLegalEntity>(settings, {
    method: "GET",
    path: `/api/v1/legal-entities/${encodeURIComponent(code)}`,
  });
}

export async function hrCoreGetPosition(settings: HrCoreSettings, code: string) {
  return requestJson<HrCorePosition>(settings, {
    method: "GET",
    path: `/api/v1/positions/${encodeURIComponent(code)}`,
  });
}

export async function hrCoreGetEvent(settings: HrCoreSettings, eventCode: string) {
  return requestJson<HrCoreEvent>(settings, {
    method: "GET",
    path: `/api/v1/events/${encodeURIComponent(eventCode)}`,
  });
}

export async function hrCoreHireIntakeValidate(settings: HrCoreSettings, payload: JsonValue) {
  return requestJson<HrCoreHireIntakeValidateResponse>(settings, {
    method: "POST",
    path: "/api/v1/tools/hire-intake-validate",
    body: payload,
  });
}
