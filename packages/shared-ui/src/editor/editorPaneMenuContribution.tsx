"use client";

import {
  createContext,
  type ReactNode,
  useContext,
} from "react";

export type EditorPaneMenuCommand = Readonly<{
  kind: "command";
  id: string;
  label: string;
  disabled?: boolean;
  run: () => void;
}>;

export type EditorPaneMenuToggle = Readonly<{
  kind: "toggle";
  id: string;
  label: string;
  checked: boolean;
  setChecked: (checked: boolean) => void;
}>;

export type EditorPaneMenuItem = EditorPaneMenuCommand | EditorPaneMenuToggle;

export type EditorPaneMenuContribution = Readonly<{
  documentId: string;
  viewItems: readonly EditorPaneMenuItem[];
}>;

type EditorPaneMenuContributionPublisher = (
  contribution: EditorPaneMenuContribution | null,
) => void;

const EditorPaneMenuContributionContext = createContext<
  EditorPaneMenuContributionPublisher | null
>(null);

export function EditorPaneMenuContributionProvider({
  children,
  onContributionChange,
}: Readonly<{
  children: ReactNode;
  onContributionChange: EditorPaneMenuContributionPublisher;
}>) {
  return (
    <EditorPaneMenuContributionContext.Provider value={onContributionChange}>
      {children}
    </EditorPaneMenuContributionContext.Provider>
  );
}

export function useEditorPaneMenuContributionPublisher() {
  return useContext(EditorPaneMenuContributionContext);
}
