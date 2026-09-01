import { createContext, useContext, type ReactNode } from "react";

// This context deliberately carries no product theme ID, catalog, or token
// payload. Hosts only signal that inherited appearance metrics changed so a
// reusable editor can remeasure without knowing who supplied the styling.
const EditorAppearanceRevisionContext = createContext<string>("default");

export function EditorAppearanceProvider({
  children,
  revision,
}: {
  children: ReactNode;
  revision: string;
}) {
  return (
    <EditorAppearanceRevisionContext.Provider value={revision}>
      {children}
    </EditorAppearanceRevisionContext.Provider>
  );
}

export function useEditorAppearanceRevision(): string {
  return useContext(EditorAppearanceRevisionContext);
}
