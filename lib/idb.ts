import { openDB, type IDBPDatabase } from "idb";

// Loose shape mirroring ProgressionPoint from lib/api.ts. Kept as `unknown`
// fields intentionally so this module doesn't import from lib/api and
// create a cycle — session-draft.ts owns the typing.
export type DraftHistoryPoint = {
  date: string;
  weight: number | null;
  difficulty: string;
  sets: number | string | null;
  reps: number | string | null;
  duration_min: number | null;
  distance_m: number | null;
  level: number | null;
};

export type DraftEntryStatus = "pending" | "saving" | "done" | "failed" | "skipped";

export type DraftEntry = {
  exercise: string;
  weight: number | null;
  sets: number | null;
  reps: string | null;
  difficulty: string;
  duration_min: number | null;
  distance_m: number | null;
  level: number | null;
  skipped: boolean;
  note: string;
  is_cardio: boolean;
  /** Deprecated: use `status`. Kept for drafts persisted before status was added. */
  dirty: boolean;
  /** Authoritative completion state. Persisted so mid-session reloads recover it. */
  status?: DraftEntryStatus;
  /** Filename written by the backend on the last successful save. Used when
   *  the user re-edits a done entry so we overwrite in place instead of
   *  creating a duplicate --02 file. */
  saved_file?: string;
  // Frozen history snapshot from session start. Last 5 entries, newest first.
  history: DraftHistoryPoint[];
};

export type DraftSession = {
  id: string;
  date: string;
  time: string;
  session_type: string;
  entries: DraftEntry[];
  status: "draft" | "concluded" | "synced";
  /** ISO timestamp captured when the draft was first built. */
  started_at?: string;
  concluded_at?: string;
  updated_at: string;
};

type TrainingSessionDB = {
  drafts: { key: string; value: DraftSession };
};

const DB_NAME = "training-session";
const DB_VERSION = 1;
const STORE = "drafts";
const CURRENT_ID = "current";

let _db: IDBPDatabase<TrainingSessionDB> | null = null;

async function getDB() {
  if (_db) return _db;
  _db = await openDB<TrainingSessionDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    },
  });
  return _db;
}

export const idb = {
  async getDraft(): Promise<DraftSession | null> {
    const db = await getDB();
    return (await db.get(STORE, CURRENT_ID)) ?? null;
  },

  async saveDraft(s: DraftSession): Promise<void> {
    const db = await getDB();
    s.updated_at = new Date().toISOString();
    await db.put(STORE, s);
  },

  async concludeDraft(): Promise<DraftSession> {
    const db = await getDB();
    const draft = await db.get(STORE, CURRENT_ID);
    if (!draft) throw new Error("No active draft to conclude");
    const concluded: DraftSession = {
      ...draft,
      status: "concluded",
      concluded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.put(STORE, concluded);
    return concluded;
  },

  async clearDraft(): Promise<void> {
    const db = await getDB();
    await db.delete(STORE, CURRENT_ID);
  },

  async getAllConcluded(): Promise<DraftSession[]> {
    const db = await getDB();
    return db.getAll(STORE);
  },
};
