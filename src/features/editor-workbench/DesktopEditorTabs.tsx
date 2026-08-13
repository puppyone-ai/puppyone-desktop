import { X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { useLocalization } from "@puppyone/localization";
import {
  FilePreviewIcon,
  type DocumentSessionStatus,
  type EditorInput,
  type FileIconThemeId,
} from "@puppyone/shared-ui";

export type DesktopEditorTabsProps = Readonly<{
  editors: readonly EditorInput[];
  activeEditorId: string | null;
  connectedToEditor?: boolean;
  fileIconTheme?: FileIconThemeId;
  workingCopyStatuses?: ReadonlyMap<string, DocumentSessionStatus>;
  onActivate: (editorId: string) => void;
  onClose: (editorId: string) => void;
}>;

/**
 * App-shell presentation for the primary Editor Group.
 *
 * Editor order and working-copy state stay in their process-neutral models;
 * this component only projects those states into the native titlebar.
 */
export function DesktopEditorTabs({
  editors,
  activeEditorId,
  connectedToEditor = true,
  fileIconTheme = "default",
  workingCopyStatuses = new Map(),
  onActivate,
  onClose,
}: DesktopEditorTabsProps) {
  const { t } = useLocalization();
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeEditorId]);

  if (editors.length === 0) return null;

  const activateRelative = (editorId: string, offset: number) => {
    const index = editors.findIndex((editor) => editor.id === editorId);
    if (index < 0) return;
    onActivate(editors[(index + offset + editors.length) % editors.length]!.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, editorId: string) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      activateRelative(editorId, event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onActivate((event.key === "Home" ? editors[0] : editors.at(-1))!.id);
    } else if (event.key === "Delete" || (event.key.toLowerCase() === "w" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      onClose(editorId);
    }
  };

  const handleAuxClick = (event: MouseEvent<HTMLButtonElement>, editorId: string) => {
    if (event.button !== 1) return;
    event.preventDefault();
    onClose(editorId);
  };

  return (
    <div
      className="desktop-editor-tabs"
      role="tablist"
      aria-label={t("editor.tabs.openEditors")}
      data-connected-to-editor={connectedToEditor ? "true" : undefined}
      data-window-no-drag="true"
      data-po-scrollbar="hidden"
    >
      {editors.map((editor) => {
        const active = editor.id === activeEditorId;
        const status = workingCopyStatuses.get(editor.resource);
        const dirty = status === "dirty" || status === "saving" || status === "error";
        return (
          <div
            className="desktop-editor-tab"
            data-active={active ? "true" : undefined}
            data-dirty={dirty ? "true" : undefined}
            data-status={status}
            key={editor.id}
          >
            <button
              className="desktop-editor-tab-target"
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={editor.resource}
              ref={active ? activeTabRef : undefined}
              onClick={() => onActivate(editor.id)}
              onAuxClick={(event) => handleAuxClick(event, editor.id)}
              onKeyDown={(event) => handleKeyDown(event, editor.id)}
            >
              <FilePreviewIcon name={editor.label} size={14} theme={fileIconTheme} />
              <span dir="auto">{editor.label}</span>
            </button>
            <button
              className="desktop-editor-tab-close"
              type="button"
              tabIndex={-1}
              aria-label={t("editor.tabs.close", { name: editor.label })}
              title={t("editor.tabs.close", { name: editor.label })}
              onClick={(event) => {
                event.stopPropagation();
                onClose(editor.id);
              }}
            >
              {dirty && <span className="desktop-editor-tab-dirty-indicator" aria-hidden="true" />}
              <X className="desktop-editor-tab-close-icon" size={13} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
