import type { HrCoreSettings } from "./hr-core-storage.ts";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type HrCoreUser = {
  id: string;
  username: string;
  role: string;
};

export type HrCoreLoginResult = {
  token: string;
  user: HrCoreUser;
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
    throw new Error(
      `${opts.method} ${opts.path} failed: ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
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
