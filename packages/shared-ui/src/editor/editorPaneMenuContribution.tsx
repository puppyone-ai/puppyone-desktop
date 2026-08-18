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

export type EditorPaneMenuSegmentedOption = Readonly<{
  id: string;
  label: string;
  icon: ReactNode;
}>;

export type EditorPaneMenuSegmentedControl = Readonly<{
  kind: "segmented";
  id: string;
  label: string;
  value: string;
  options: readonly EditorPaneMenuSegmentedOption[];
  setValue: (value: string) => void;
}>;

export type EditorPaneMenuItem =
  | EditorPaneMenuCommand
  | EditorPaneMenuToggle
  | EditorPaneMenuSegmentedControl;

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
