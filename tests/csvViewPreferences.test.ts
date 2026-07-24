import { describe, expect, it } from "vitest";
import {
  readCsvFirstRecordAsHeaderPreference,
  writeCsvFirstRecordAsHeaderPreference,
} from "../packages/shared-ui/src/editor/csv/csvViewPreferences";

describe("CSV view preferences", () => {
  it("keeps header interpretation per document without touching CSV content", () => {
    const storage = createMemoryStorage();

    expect(readCsvFirstRecordAsHeaderPreference("/vault/one.csv", storage)).toBeUndefined();
    writeCsvFirstRecordAsHeaderPreference("/vault/one.csv", true, storage);
    writeCsvFirstRecordAsHeaderPreference("/vault/two.csv", false, storage);

    expect(readCsvFirstRecordAsHeaderPreference("/vault/one.csv", storage)).toBe(true);
    expect(readCsvFirstRecordAsHeaderPreference("/vault/two.csv", storage)).toBe(false);
  });

  it("fails open when preference storage is missing or malformed", () => {
    const storage = createMemoryStorage("not-json");

    expect(readCsvFirstRecordAsHeaderPreference("/vault/table.csv", storage)).toBeUndefined();
    expect(() => writeCsvFirstRecordAsHeaderPreference(undefined, true, storage)).not.toThrow();
    expect(() => writeCsvFirstRecordAsHeaderPreference("/vault/table.csv", true, {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage unavailable");
      },
    })).not.toThrow();
  });
});

function createMemoryStorage(initialValue?: string) {
  const values = new Map<string, string>();
  if (initialValue !== undefined) values.set("puppyone.editor.csv-view-preferences.v1", initialValue);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

