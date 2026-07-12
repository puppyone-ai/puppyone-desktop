import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  BUILTIN_FONT_CATALOG,
  isValidFontCatalogEntry,
  type FontCatalogEntry,
} from "./fontCatalog";

const TypographyCatalogContext = createContext<readonly FontCatalogEntry[]>(BUILTIN_FONT_CATALOG);
const EMPTY_FONT_CATALOG_ENTRIES: readonly FontCatalogEntry[] = Object.freeze([]);

export function TypographyCatalogProvider({
  additionalEntries = EMPTY_FONT_CATALOG_ENTRIES,
  children,
}: {
  additionalEntries?: readonly FontCatalogEntry[];
  children: ReactNode;
}) {
  const catalog = useMemo(() => {
    const entriesById = new Map<string, FontCatalogEntry>(
      BUILTIN_FONT_CATALOG.map((entry) => [entry.id, entry]),
    );
    for (const entry of additionalEntries) {
      if (!isValidFontCatalogEntry(entry) || entriesById.has(entry.id)) continue;
      entriesById.set(entry.id, entry);
    }
    return Object.freeze([...entriesById.values()]);
  }, [additionalEntries]);

  return (
    <TypographyCatalogContext.Provider value={catalog}>
      {children}
    </TypographyCatalogContext.Provider>
  );
}

export function useTypographyCatalog() {
  return useContext(TypographyCatalogContext);
}
