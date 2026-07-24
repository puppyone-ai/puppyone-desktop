const CSV_VIEW_PREFERENCES_STORAGE_KEY = "puppyone.editor.csv-view-preferences.v1";
const MAX_STORED_CSV_VIEW_PREFERENCES = 200;

type CsvViewPreferenceEntry = Readonly<{
  firstRecordAsHeader: boolean;
  updatedAt: number;
}>;

type CsvViewPreferenceStore = Record<string, CsvViewPreferenceEntry>;

type CsvViewPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function readCsvFirstRecordAsHeaderPreference(
  documentId: string | undefined,
  storage: CsvViewPreferenceStorage | null = getBrowserStorage(),
): boolean | undefined {
  const key = normalizeDocumentId(documentId);
  if (!key || !storage) return undefined;
  return readPreferenceStore(storage)[key]?.firstRecordAsHeader;
}

export function writeCsvFirstRecordAsHeaderPreference(
  documentId: string | undefined,
  firstRecordAsHeader: boolean,
  storage: CsvViewPreferenceStorage | null = getBrowserStorage(),
) {
  const key = normalizeDocumentId(documentId);
  if (!key || !storage) return;

  const nextStore: CsvViewPreferenceStore = {
    ...readPreferenceStore(storage),
    [key]: {
      firstRecordAsHeader,
      updatedAt: Date.now(),
    },
  };
  const recentEntries = Object.entries(nextStore)
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, MAX_STORED_CSV_VIEW_PREFERENCES);

  try {
    storage.setItem(CSV_VIEW_PREFERENCES_STORAGE_KEY, JSON.stringify(Object.fromEntries(recentEntries)));
  } catch {
    // View preferences are best-effort and must never block document editing.
  }
}

function readPreferenceStore(storage: CsvViewPreferenceStorage): CsvViewPreferenceStore {
  try {
    const raw = storage.getItem(CSV_VIEW_PREFERENCES_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const entries: CsvViewPreferenceStore = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const candidate = value as Partial<CsvViewPreferenceEntry>;
      if (typeof candidate.firstRecordAsHeader !== "boolean") continue;
      entries[key] = {
        firstRecordAsHeader: candidate.firstRecordAsHeader,
        updatedAt: typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
          ? candidate.updatedAt
          : 0,
      };
    }
    return entries;
  } catch {
    return {};
  }
}

function getBrowserStorage(): CsvViewPreferenceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeDocumentId(documentId: string | undefined): string | null {
  const normalized = documentId?.trim();
  return normalized ? normalized : null;
}

