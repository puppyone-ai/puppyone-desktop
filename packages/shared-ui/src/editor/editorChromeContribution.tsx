"use client";

import {
  createContext,
  type ReactNode,
  useContext,
} from "react";

export type CsvViewSettingsContribution = Readonly<{
  kind: "csv-view-settings";
  documentId: string;
  headerEnabled: boolean;
  rowNumbersVisible: boolean;
  onHeaderChange: (enabled: boolean) => void;
  onRowNumbersChange: (visible: boolean) => void;
}>;

export type EditorChromeContribution = CsvViewSettingsContribution;

type EditorChromeContributionPublisher = (
  contribution: EditorChromeContribution | null,
) => void;

const EditorChromeContributionContext = createContext<
  EditorChromeContributionPublisher | null
>(null);

export function EditorChromeContributionProvider({
  children,
  onContributionChange,
}: Readonly<{
  children: ReactNode;
  onContributionChange: EditorChromeContributionPublisher;
}>) {
  return (
    <EditorChromeContributionContext.Provider value={onContributionChange}>
      {children}
    </EditorChromeContributionContext.Provider>
  );
}

export function useEditorChromeContributionPublisher() {
  return useContext(EditorChromeContributionContext);
}
