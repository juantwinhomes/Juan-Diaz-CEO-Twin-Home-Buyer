/**
 * Thin client over the Google Analytics 4 Data + Admin REST APIs.
 *
 * Credentials resolve in this order:
 *   1. GOOGLE_SERVICE_ACCOUNT_JSON — the full service-account key as a JSON string.
 *      Use this on hosts where you cannot attach an identity (Render, Railway, Fly).
 *   2. Application Default Credentials — on Cloud Run this is the service account
 *      attached to the revision, so no key material ever exists on disk.
 *
 * Whichever identity is used must be added as a Viewer on the GA4 property.
 */
import { GoogleAuth } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";

let cachedAuth: GoogleAuth | undefined;

function auth(): GoogleAuth {
  if (cachedAuth) return cachedAuth;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw && raw.trim()) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(raw);
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON is set but is not valid JSON. Paste the whole key file contents, including the surrounding braces.",
      );
    }
    cachedAuth = new GoogleAuth({ credentials, scopes: SCOPES });
  } else {
    cachedAuth = new GoogleAuth({ scopes: SCOPES });
  }
  return cachedAuth;
}

/** Surfaces Google's own error text — vague failures here waste hours. */
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const client = await auth().getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error(
      "Could not obtain a Google access token. On Cloud Run, confirm a service account is attached; elsewhere, confirm GOOGLE_SERVICE_ACCOUNT_JSON is set.",
    );
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 800);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) detail = parsed.error.message;
    } catch {
      /* keep the raw body */
    }
    if (res.status === 403) {
      throw new Error(
        `Google refused the request (403): ${detail} — the usual cause is that this service account has not been added as a Viewer on the GA4 property, or the Analytics Data API is not enabled on the project.`,
      );
    }
    throw new Error(`Google Analytics API error ${res.status}: ${detail}`);
  }
  return JSON.parse(text) as T;
}

export interface GaHeader {
  name?: string;
}
export interface GaRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}
export interface GaResponse {
  dimensionHeaders?: GaHeader[];
  metricHeaders?: GaHeader[];
  rows?: GaRow[];
  rowCount?: number;
  totals?: GaRow[];
}

export interface FlatResult {
  rows: Record<string, string | number | null>[];
  rowCount: number;
  totals: Record<string, number> | null;
}

/**
 * GA4 answers with parallel header/value arrays. Flatten to plain row objects
 * so consumers can read `row.sessions` instead of walking index positions.
 */
export function flatten(resp: GaResponse): FlatResult {
  const dims = (resp.dimensionHeaders ?? []).map((h) => h.name ?? "");
  const mets = (resp.metricHeaders ?? []).map((h) => h.name ?? "");

  const toRow = (r: GaRow): Record<string, string | number | null> => {
    const out: Record<string, string | number | null> = {};
    dims.forEach((d, i) => {
      out[d] = r.dimensionValues?.[i]?.value ?? null;
    });
    mets.forEach((m, i) => {
      const raw = r.metricValues?.[i]?.value;
      if (raw === undefined) {
        out[m] = null;
        return;
      }
      const n = Number(raw);
      out[m] = Number.isFinite(n) ? n : raw;
    });
    return out;
  };

  const rows = (resp.rows ?? []).map(toRow);

  let totals: Record<string, number> | null = null;
  const totalRow = resp.totals?.[0];
  if (totalRow) {
    totals = {};
    mets.forEach((m, i) => {
      const n = Number(totalRow.metricValues?.[i]?.value);
      totals![m] = Number.isFinite(n) ? n : 0;
    });
  }

  return { rows, rowCount: resp.rowCount ?? rows.length, totals };
}

/** Accepts "properties/123456" or a bare "123456". */
export function normalizeProperty(id: string): string {
  const trimmed = id.trim();
  const bare = trimmed.startsWith("properties/") ? trimmed.slice("properties/".length) : trimmed;
  if (!/^\d+$/.test(bare)) {
    throw new Error(
      `"${id}" is not a GA4 property ID. It must be numeric, like 123456789 — run ga4_list_properties to find it. (A "G-XXXXXXX" measurement ID will not work here.)`,
    );
  }
  return bare;
}

export interface ReportRequest {
  dateRanges: { startDate: string; endDate: string }[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  limit?: string;
  orderBys?: unknown[];
  dimensionFilter?: unknown;
  keepEmptyRows?: boolean;
}

export async function runReport(propertyId: string, body: ReportRequest): Promise<FlatResult> {
  const id = normalizeProperty(propertyId);
  const resp = await call<GaResponse>(`${DATA_API}/properties/${id}:runReport`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return flatten(resp);
}

export async function runRealtimeReport(
  propertyId: string,
  body: { dimensions?: { name: string }[]; metrics: { name: string }[]; limit?: string },
): Promise<FlatResult> {
  const id = normalizeProperty(propertyId);
  const resp = await call<GaResponse>(`${DATA_API}/properties/${id}:runRealtimeReport`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return flatten(resp);
}

export interface PropertySummary {
  property: string;
  propertyId: string;
  displayName: string;
  account: string;
  accountName: string;
}

/** Lists every property this identity can read — the fastest way to find a property ID. */
export async function listProperties(): Promise<PropertySummary[]> {
  interface AccountSummary {
    account?: string;
    displayName?: string;
    propertySummaries?: { property?: string; displayName?: string }[];
  }
  const resp = await call<{ accountSummaries?: AccountSummary[] }>(
    `${ADMIN_API}/accountSummaries?pageSize=200`,
  );
  const out: PropertySummary[] = [];
  for (const acct of resp.accountSummaries ?? []) {
    for (const p of acct.propertySummaries ?? []) {
      const property = p.property ?? "";
      out.push({
        property,
        propertyId: property.replace("properties/", ""),
        displayName: p.displayName ?? "",
        account: acct.account ?? "",
        accountName: acct.displayName ?? "",
      });
    }
  }
  return out;
}
