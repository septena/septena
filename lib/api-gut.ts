// API client for the Gut section. Mirrors the style of the caffeine /
// cannabis blocks in lib/api.ts; kept in its own file for locality.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function gutRequest<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export type BristolDef = { id: number; label: string; description: string };
export type BloodDef = { id: number; label: string };
export type GutConfig = { bristol: BristolDef[]; blood: BloodDef[] };

export type GutEntry = {
  date: string;
  time: string;
  id: string;
  bristol: number;
  blood: number;
  discomfort_level: "low" | "med" | "high" | null;
  discomfort_start: string | null;
  discomfort_end: string | null;
  discomfort_hours: number | null;
  discomfort_open: boolean;
  note: string | null;
  created_at?: string;
  updated_at?: string;
};

export type GutDay = {
  date: string;
  entries: GutEntry[];
  movement_count: number;
  bristol_counts: Record<string, number>;
  max_blood: number;
  total_discomfort_h: number;
  open_discomfort: number;
};

export type GutHistoryPoint = {
  date: string;
  movements: number;
  avg_bristol: number | null;
  max_blood: number;
  discomfort_h: number;
};

export type GutHistory = { daily: GutHistoryPoint[] };

export async function getGutConfig() {
  return gutRequest<GutConfig>("/api/gut/config");
}

export async function getGutDay(day: string) {
  return gutRequest<GutDay>(`/api/gut/day/${day}`);
}

export async function getGutHistory(days = 30) {
  return gutRequest<GutHistory>(`/api/gut/history?days=${days}`);
}

export async function addGutEntry(payload: {
  date: string;
  time: string;
  bristol: number;
  blood: number;
  discomfort_level?: "low" | "med" | "high" | null;
  discomfort_hours?: number | null;
  note?: string | null;
}) {
  return gutRequest<{ ok: boolean; entry: GutEntry }>("/api/gut/entry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateGutEntry(
  entryId: string,
  date: string,
  patch: Partial<{
    time: string;
    bristol: number;
    blood: number;
    note: string | null;
    discomfort_level: "low" | "med" | "high" | null;
    discomfort_hours: number | null;
    discomfort_start: string | null;
    discomfort_end: string | "now" | null;
  }>,
) {
  return gutRequest<{ ok: boolean; entry: GutEntry }>(
    `/api/gut/entry/${entryId}?date=${date}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
}

export async function deleteGutEntry(entryId: string, date: string) {
  return gutRequest<{ ok: boolean }>(`/api/gut/entry/${entryId}?date=${date}`, {
    method: "DELETE",
  });
}
