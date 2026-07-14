import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ClipboardPaste,
  Copy,
  CopyPlus,
  ExternalLink,
  FileText,
  FolderOpen,
  FolderPlus,
  MoreVertical,
  Pencil,
  Plus,
  Scissors,
  Trash2,
  Workflow,
} from "lucide-react";
import { FileGlyphIcon, getMatchedExtension, type DataNode, type FileIconThemeId } from "@puppyone/shared-ui";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { DesktopDialogCloseButton, DesktopDialogRoot } from "../../components/DesktopDialog";
import { DesktopMenuItem, DesktopMenuSeparator, DesktopMenuSurface } from "../../components/DesktopMenu";
import type { ExperimentalSettings } from "../../preferences";
import {
  createDefaultPuppyFlowDocument,
  serializePuppyFlowDocument,
  type PuppyFlowDocumentDefaults,
} from "../puppyflow/puppyflowModel";

export type DesktopCreateEntryKind = "folder" | "markdown" | "text" | "json" | "csv" | "app" | "puppyflow";
export type DesktopCreateEntryAnchor = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  placement?: "below-start" | "below-end" | "above-start" | "above-end" | "auto-start" | "auto-end";
};
export type DesktopCreateEntryAnchorInput = DOMRect | DesktopCreateEntryAnchor;
export type DesktopCreateEntryDraft = {
  parentPath: string | null;
  anchor: DesktopCreateEntryAnchor;
  error: DesktopNodeActionError | null;
  creatingKind: DesktopCreateEntryKind | null;
  selectedKind: DesktopCreateEntryKind | null;
  name: string;
};
export type DesktopNodeActionMenuDraft = {
  node: DataNode;
  nodes: DataNode[];
  anchor: DesktopCreateEntryAnchor;
  mode: "actions" | "rename";
  renameNameValue: string;
  renameExtensionValue: string;
  renameFocus: "name" | "type";
  error: DesktopNodeActionError | null;
  operation: "rename" | "delete" | "open" | "reveal" | "paste" | "duplicate" | null;
};

export type DesktopNodeActionError = Readonly<
  | { code: "name-required" }
  | { code: "name-invalid" }
  | { code: "name-unsupported" }
  | { code: "operation-failed"; detail: string }
  | { code: "delete-partial"; deletedCount: number; failedCount: number; detail: string }
>;

const CREATE_ENTRY_MENU_MARGIN = 12;
const CREATE_ENTRY_MENU_WIDTH = 184;
const CREATE_ENTRY_MENU_ESTIMATED_HEIGHT = 184;
const NODE_ACTION_MENU_WIDTH = 224;
const NODE_ACTION_MENU_ESTIMATED_HEIGHT = 342;

const CREATE_ENTRY_OPTIONS = [
  {
    kind: "folder",
    iconName: "folder",
    iconType: "folder",
  },
  {
    kind: "markdown",
    iconName: "Untitled.md",
    iconType: "markdown",
  },
  {
    kind: "text",
    iconName: "Untitled.txt",
    iconType: "text",
  },
  {
    kind: "json",
    iconName: "Untitled.json",
    iconType: "json",
  },
  {
    kind: "app",
    iconName: "Untitled.puppyoneapp",
    iconType: "app",
  },
  {
    kind: "puppyflow",
    iconName: "Untitled.puppyflow",
    iconType: "workflow",
  },
  {
    kind: "csv",
    iconName: "Untitled.csv",
    iconType: "spreadsheet",
  },
] as const satisfies Array<{
  kind: DesktopCreateEntryKind;
  iconName: string;
  iconType: DataNode["type"];
}>;

type CreateEntryOption = (typeof CREATE_ENTRY_OPTIONS)[number];
const CUSTOM_CREATE_ENTRY_KINDS = new Set<DesktopCreateEntryKind>(["app", "puppyflow"]);
const STANDARD_CREATE_ENTRY_OPTIONS = CREATE_ENTRY_OPTIONS.filter((option) => !CUSTOM_CREATE_ENTRY_KINDS.has(option.kind));
const CUSTOM_CREATE_ENTRY_OPTIONS = CREATE_ENTRY_OPTIONS.filter((option) => CUSTOM_CREATE_ENTRY_KINDS.has(option.kind));

export function DesktopExplorerRowActions({
  node,
  parentPath,
  onCreate,
  onOpenNodeMenu,
}: {
  node?: DataNode;
  parentPath: string | null;
  onCreate: (parentPath: string | null, anchorRect: DOMRect) => void;
  onOpenNodeMenu: (node: DataNode, anchorRect: DOMRect) => void;
}) {
  const { t } = useLocalization();
  const canCreate = node?.type === "folder" || !node;

  return (
    <>
      {canCreate && (
        <button
          className="tree-row-action-button"
          type="button"
          title={t("workspace.node.createNew")}
          aria-label={t("workspace.node.createNew")}
          onClick={(event) => onCreate(parentPath, event.currentTarget.getBoundingClientRect())}
        >
          <Plus aria-hidden="true" />
        </button>
      )}
      {node && (
        <button
          className="tree-row-action-button"
          type="button"
          title={t("workspace.node.moreActions")}
          aria-label={t("workspace.node.moreActionsFor", { name: bidiIsolate(node.name) })}
          onClick={(event) => onOpenNodeMenu(node, event.currentTarget.getBoundingClientRect())}
        >
          <MoreVertical aria-hidden="true" />
        </button>
      )}
    </>
  );
}

export function DesktopCreateEntryMenu({
  draft,
  experimentalSettings,
  fileIconTheme,
  onCancel,
  onPaste,
  pasteDisabled = false,
  pasteLabel,
  onSelectKind,
}: {
  draft: DesktopCreateEntryDraft;
  experimentalSettings?: ExperimentalSettings | null;
  fileIconTheme?: FileIconThemeId | null;
  onCancel: () => void;
  onPaste?: () => void;
  pasteDisabled?: boolean;
  pasteLabel?: string;
  onSelectKind: (kind: DesktopCreateEntryKind) => void;
}) {
  const { t } = useLocalization();
  const menuRef = useRef<HTMLDivElement>(null);
  const customMenuCloseTimerRef = useRef<number | null>(null);
  const [customMenuOpen, setCustomMenuOpen] = useState(false);
  const customCreateEntryOptions = CUSTOM_CREATE_ENTRY_OPTIONS.filter((option) => {
    if (option.kind === "app") return experimentalSettings?.enablePuppyoneAppFiles === true;
    if (option.kind === "puppyflow") return experimentalSettings?.enablePuppyFlowFiles === true;
    return false;
  });
  const position = getCreateEntryMenuPosition(draft.anchor);
  const menuStyle = {
    "--node-action-menu-left": `${position.left}px`,
    "--node-action-menu-top": `${position.top}px`,
    "--node-action-menu-width": `${CREATE_ENTRY_MENU_WIDTH}px`,
  } as CSSProperties;

  const openCustomMenu = () => {
    if (customMenuCloseTimerRef.current !== null) {
      window.clearTimeout(customMenuCloseTimerRef.current);
      customMenuCloseTimerRef.current = null;
    }
    setCustomMenuOpen(true);
  };

  const scheduleCloseCustomMenu = () => {
    if (customMenuCloseTimerRef.current !== null) {
      window.clearTimeout(customMenuCloseTimerRef.current);
    }
    customMenuCloseTimerRef.current = window.setTimeout(() => {
      customMenuCloseTimerRef.current = null;
      setCustomMenuOpen(false);
    }, 220);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => {
    if (customMenuCloseTimerRef.current !== null) {
      window.clearTimeout(customMenuCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      onCancel();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    const handleViewportChange = () => onCancel();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [onCancel]);

  return (
    <DesktopMenuSurface
      ref={menuRef}
      className="desktop-create-entry-menu desktop-node-action-menu"
      ariaLabel={t("workspace.node.createNew")}
      style={menuStyle}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {onPaste && (
        <>
          <DesktopNodeActionMenuItem
            icon={<ClipboardPaste size={14} />}
            label={pasteLabel ?? t("workspace.node.paste")}
            shortcut={getPlatformShortcut("V")}
            disabled={pasteDisabled}
            onClick={onPaste}
          />
          <DesktopMenuSeparator />
        </>
      )}
      {STANDARD_CREATE_ENTRY_OPTIONS.map((option) => (
        <DesktopNodeActionMenuItem
          key={option.kind}
          icon={<CreateEntryGlyph option={option} theme={fileIconTheme} />}
          label={getCreateEntryOptionLabel(option.kind, t)}
          onClick={() => onSelectKind(option.kind)}
        />
      ))}
      {customCreateEntryOptions.length > 0 && (
        <div
          className="desktop-create-entry-submenu-wrap"
          data-open={customMenuOpen ? "true" : "false"}
          onPointerEnter={openCustomMenu}
          onPointerLeave={scheduleCloseCustomMenu}
          onFocus={openCustomMenu}
          onBlur={(event) => {
            const relatedTarget = event.relatedTarget;
            if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
            scheduleCloseCustomMenu();
          }}
        >
          <DesktopMenuItem
            className="desktop-node-action-menu-item desktop-create-entry-submenu-trigger"
            icon={<Workflow size={14} />}
            label={t("workspace.node.customFiles")}
            trailing={<ChevronRight className="po-directional-icon" size={14} />}
            aria-haspopup="menu"
            aria-expanded={customMenuOpen}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openCustomMenu();
            }}
          />
          <DesktopMenuSurface
            className="desktop-create-entry-submenu"
            ariaLabel={t("workspace.node.createCustomFile")}
            role="menu"
          >
            {customCreateEntryOptions.map((option) => (
              <DesktopNodeActionMenuItem
                key={option.kind}
                icon={<CreateEntryGlyph option={option} theme={fileIconTheme} />}
                label={getCreateEntryOptionLabel(option.kind, t)}
                onClick={() => onSelectKind(option.kind)}
              />
            ))}
          </DesktopMenuSurface>
        </div>
      )}
    </DesktopMenuSurface>
  );
}

export function DesktopCreateEntryDialog({
  draft,
  fileIconTheme,
  onChange,
  onCancel,
  onCreate,
}: {
  draft: DesktopCreateEntryDraft;
  fileIconTheme?: FileIconThemeId | null;
  onChange: Dispatch<SetStateAction<DesktopCreateEntryDraft | null>>;
  onCancel: () => void;
  onCreate: () => void;
}) {
  const { t } = useLocalization();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedKind = draft.selectedKind;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && draft.creatingKind === null) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [draft.creatingKind, onCancel]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => inputRef.current?.select());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!selectedKind) return null;

  const selectedOption = getCreateEntryOption(selectedKind);
  const extensionNote = getCreateEntryExtensionNote(selectedKind, t);
  const optionLabel = getCreateEntryOptionLabel(selectedKind, t);
  const errorMessage = formatDesktopNodeActionError(draft.error, t);

  return (
    <DesktopDialogRoot
      onClose={onCancel}
      dismissOnBackdrop={draft.creatingKind === null}
    >
      <form
        className="desktop-dialog-surface desktop-file-dialog desktop-create-entry-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-create-entry-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <header className="desktop-dialog-header">
          <div className="desktop-dialog-title-row">
            <span className="desktop-dialog-leading file" aria-hidden="true">
              <CreateEntryGlyph option={selectedOption} theme={fileIconTheme} size={16} />
            </span>
            <div>
              <h2 id="desktop-create-entry-title">{getCreateEntryDialogTitle(selectedKind, t)}</h2>
              <p>{draft.parentPath
                ? t("workspace.node.createIn", { path: bidiIsolate(draft.parentPath) })
                : t("workspace.node.createInRoot")}</p>
            </div>
          </div>
          <DesktopDialogCloseButton disabled={draft.creatingKind !== null} onClick={onCancel} />
        </header>

        <div className="desktop-dialog-body desktop-file-dialog-body">
          <label className="desktop-dialog-field">
            <span>{t("workspace.node.name")}</span>
            <input
              ref={inputRef}
              value={draft.name}
              disabled={draft.creatingKind !== null}
              aria-label={t("workspace.node.kindName", { kind: optionLabel })}
              placeholder={t("workspace.node.kindName", { kind: optionLabel })}
              onChange={(event) => {
                const value = event.target.value;
                onChange((current) => current ? { ...current, name: value, error: null } : current);
              }}
            />
          </label>

          {extensionNote && (
            <div className="desktop-dialog-note">{extensionNote}</div>
          )}
          {errorMessage && <div className="desktop-dialog-error" dir="auto">{errorMessage}</div>}
        </div>

        <footer className="desktop-dialog-footer">
          <button
            className="desktop-dialog-button"
            type="button"
            disabled={draft.creatingKind !== null}
            onClick={onCancel}
          >
            {t("common.action.cancel")}
          </button>
          <button
            className="desktop-dialog-button primary file"
            type="submit"
            disabled={draft.creatingKind !== null || !draft.name.trim()}
          >
            {draft.creatingKind ? t("workspace.node.creating") : t("workspace.node.create")}
          </button>
        </footer>
      </form>
    </DesktopDialogRoot>
  );
}

export function DesktopNodeActionMenu({
  draft,
  experimentalSettings,
  showRevealInFinder = true,
  showOpenInDefaultApp = true,
  canPaste = false,
  canCopy = true,
  canCut = true,
  canDuplicate = true,
  onChange,
  onCancel,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
  onCreateInside,
  onRename,
  onDelete,
  onOpenInDefaultApp,
  onRevealInFinder,
}: {
  draft: DesktopNodeActionMenuDraft;
  experimentalSettings?: ExperimentalSettings | null;
  showRevealInFinder?: boolean;
  showOpenInDefaultApp?: boolean;
  canPaste?: boolean;
  canCopy?: boolean;
  canCut?: boolean;
  canDuplicate?: boolean;
  onChange: Dispatch<SetStateAction<DesktopNodeActionMenuDraft | null>>;
  onCancel: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onCreateInside: () => void;
  onRename: () => void;
  onDelete: () => void;
  onOpenInDefaultApp: () => void;
  onRevealInFinder: () => void;
}) {
  if (draft.mode === "rename") {
    return (
      <DesktopNodeRenameDialog
        draft={draft}
        experimentalSettings={experimentalSettings}
        onChange={onChange}
        onCancel={onCancel}
        onRename={onRename}
      />
    );
  }

  return (
      <DesktopNodeActionPopover
        draft={draft}
        showRevealInFinder={showRevealInFinder}
        showOpenInDefaultApp={showOpenInDefaultApp}
        canPaste={canPaste}
        canCopy={canCopy}
        canCut={canCut}
        canDuplicate={canDuplicate}
        onChange={onChange}
        onCancel={onCancel}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onDuplicate={onDuplicate}
        onCreateInside={onCreateInside}
        onDelete={onDelete}
        onOpenInDefaultApp={onOpenInDefaultApp}
        onRevealInFinder={onRevealInFinder}
      />
  );
}

function DesktopNodeActionPopover({
  draft,
  showRevealInFinder,
  showOpenInDefaultApp,
  canPaste,
  canCopy,
  canCut,
  canDuplicate,
  onChange,
  onCancel,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
  onCreateInside,
  onDelete,
  onOpenInDefaultApp,
  onRevealInFinder,
}: {
  draft: DesktopNodeActionMenuDraft;
  showRevealInFinder: boolean;
  showOpenInDefaultApp: boolean;
  canPaste: boolean;
  canCopy: boolean;
  canCut: boolean;
  canDuplicate: boolean;
  onChange: Dispatch<SetStateAction<DesktopNodeActionMenuDraft | null>>;
  onCancel: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onCreateInside: () => void;
  onDelete: () => void;
  onOpenInDefaultApp: () => void;
  onRevealInFinder: () => void;
}) {
  const { t } = useLocalization();
  const menuRef = useRef<HTMLDivElement>(null);
  const actionCount = Math.max(1, draft.nodes.length);
  const singleNodeAction = actionCount === 1;
  const position = getNodeActionMenuPosition(draft.anchor, NODE_ACTION_MENU_WIDTH, NODE_ACTION_MENU_ESTIMATED_HEIGHT);
  const menuStyle = {
    "--node-action-menu-left": `${position.left}px`,
    "--node-action-menu-top": `${position.top}px`,
    "--node-action-menu-width": `${NODE_ACTION_MENU_WIDTH}px`,
  } as CSSProperties;
  const errorMessage = formatDesktopNodeActionError(draft.error, t);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      onCancel();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    const handleViewportChange = () => onCancel();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [onCancel]);

  return (
    <DesktopMenuSurface
      ref={menuRef}
      className="desktop-node-action-menu"
      ariaLabel={t("workspace.node.actionsFor", { name: bidiIsolate(draft.node.name) })}
      style={menuStyle}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {draft.node.type === "folder" && (
        <DesktopNodeActionMenuItem
          icon={<FolderPlus size={14} />}
          label={t("workspace.node.newFileOrFolder")}
          disabled={draft.operation !== null}
          onClick={onCreateInside}
        />
      )}
      {draft.node.type === "folder" && (
        <DesktopNodeActionMenuItem
          icon={<ClipboardPaste size={14} />}
          label={t("workspace.node.pasteIntoFolder")}
          shortcut={getPlatformShortcut("V")}
          disabled={draft.operation !== null || !canPaste}
          onClick={onPaste}
        />
      )}
      {draft.node.type === "folder" && <DesktopMenuSeparator />}
      <DesktopNodeActionMenuItem
        icon={<Copy size={14} />}
        label={t("workspace.node.copyItems", { count: actionCount })}
        shortcut={getPlatformShortcut("C")}
        disabled={draft.operation !== null || !canCopy}
        onClick={onCopy}
      />
      <DesktopNodeActionMenuItem
        icon={<Scissors size={14} />}
        label={t("workspace.node.cutItems", { count: actionCount })}
        shortcut={getPlatformShortcut("X")}
        disabled={draft.operation !== null || !canCut}
        onClick={onCut}
      />
      <DesktopNodeActionMenuItem
        icon={<CopyPlus size={14} />}
        label={draft.operation === "duplicate"
          ? t("workspace.node.duplicating")
          : t("workspace.node.duplicateItems", { count: actionCount })}
        shortcut={getPlatformShortcut("D")}
        disabled={draft.operation !== null || !canDuplicate}
        onClick={onDuplicate}
      />
      <DesktopMenuSeparator />
      {singleNodeAction && showOpenInDefaultApp && draft.node.type !== "folder" && (
        <DesktopNodeActionMenuItem
          icon={<ExternalLink size={14} />}
          label={draft.operation === "open" ? t("workspace.node.opening") : t("workspace.node.openDefaultApp")}
          disabled={draft.operation !== null}
          onClick={onOpenInDefaultApp}
        />
      )}
      {singleNodeAction && showRevealInFinder && (
        <DesktopNodeActionMenuItem
          icon={<FolderOpen size={14} />}
          label={draft.operation === "reveal" ? t("workspace.node.opening") : t("workspace.node.revealInFinder")}
          disabled={draft.operation !== null}
          onClick={onRevealInFinder}
        />
      )}
      {singleNodeAction && (
        <DesktopNodeActionMenuItem
          icon={<Pencil size={14} />}
          label={t("workspace.node.rename")}
          disabled={draft.operation !== null}
          onClick={() => onChange((current) => current ? {
            ...current,
            mode: "rename",
            renameFocus: "name",
            error: null,
          } : current)}
        />
      )}
      {singleNodeAction && draft.node.type !== "folder" && (
        <DesktopNodeActionMenuItem
          icon={<FileText size={14} />}
          label={t("workspace.node.changeType")}
          disabled={draft.operation !== null}
          onClick={() => onChange((current) => current ? {
            ...current,
            mode: "rename",
            renameFocus: "type",
            error: null,
          } : current)}
        />
      )}
      <DesktopNodeActionMenuItem
        icon={<Trash2 size={14} />}
        label={draft.operation === "delete"
          ? t("workspace.node.deleting")
          : t("workspace.node.deleteItems", { count: actionCount })}
        destructive
        disabled={draft.operation !== null}
        onClick={onDelete}
      />
      {errorMessage && <div className="desktop-node-action-error" dir="auto">{errorMessage}</div>}
    </DesktopMenuSurface>
  );
}

function DesktopNodeRenameDialog({
  draft,
  experimentalSettings,
  onChange,
  onCancel,
  onRename,
}: {
  draft: DesktopNodeActionMenuDraft;
  experimentalSettings?: ExperimentalSettings | null;
  onChange: Dispatch<SetStateAction<DesktopNodeActionMenuDraft | null>>;
  onCancel: () => void;
  onRename: () => void;
}) {
  const { t } = useLocalization();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const isFile = draft.node.type !== "folder";
  const fileTypeOptions = useMemo(
    () => getDesktopFileTypeOptions(draft.renameExtensionValue, t, experimentalSettings),
    [draft.renameExtensionValue, experimentalSettings, t],
  );
  const title = draft.renameFocus === "type" && isFile
    ? t("workspace.node.changeType")
    : t("workspace.node.rename");
  const errorMessage = formatDesktopNodeActionError(draft.error, t);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && draft.operation === null) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [draft.operation, onCancel]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (draft.renameFocus === "type" && isFile) {
        selectRef.current?.focus();
        return;
      }
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draft.renameFocus, isFile]);

  return (
    <DesktopDialogRoot
      onClose={onCancel}
      dismissOnBackdrop={draft.operation === null}
    >
      <form
        className="desktop-dialog-surface desktop-file-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-node-rename-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onRename();
        }}
      >
        <header className="desktop-dialog-header">
          <div className="desktop-dialog-title-row">
            <div>
              <h2 id="desktop-node-rename-title">{title}</h2>
            </div>
          </div>
          <DesktopDialogCloseButton disabled={draft.operation !== null} onClick={onCancel} />
        </header>

        <div className="desktop-dialog-body desktop-file-dialog-body">
          <label className="desktop-dialog-field">
            <span>{t("workspace.node.name")}</span>
            <input
              ref={inputRef}
              value={draft.renameNameValue}
              disabled={draft.operation !== null}
              onChange={(event) => {
                const value = event.target.value;
                onChange((current) => current ? { ...current, renameNameValue: value, error: null } : current);
              }}
            />
          </label>
          {isFile && (
            <label className="desktop-dialog-field">
              <span>{t("workspace.node.type")}</span>
              <select
                ref={selectRef}
                value={normalizeDesktopExtension(draft.renameExtensionValue)}
                disabled={draft.operation !== null}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange((current) => current ? {
                    ...current,
                    renameExtensionValue: value,
                    renameFocus: "type",
                    error: null,
                  } : current);
                }}
              >
                {fileTypeOptions.map((option) => (
                  <option key={option.extension || "__none__"} value={option.extension}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {errorMessage && <div className="desktop-dialog-error" dir="auto">{errorMessage}</div>}
        </div>

        <footer className="desktop-dialog-footer">
          <button
            className="desktop-dialog-button"
            type="button"
            disabled={draft.operation !== null}
            onClick={onCancel}
          >
            {t("common.action.cancel")}
          </button>
          <button
            className="desktop-dialog-button primary file"
            type="submit"
            disabled={draft.operation !== null || !draft.renameNameValue.trim()}
          >
            {draft.operation === "rename" ? t("workspace.node.saving") : t("common.action.save")}
          </button>
        </footer>
      </form>
    </DesktopDialogRoot>
  );
}

function DesktopNodeActionMenuItem({
  icon,
  label,
  destructive,
  disabled,
  shortcut,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <DesktopMenuItem
      className="desktop-node-action-menu-item"
      destructive={destructive}
      disabled={disabled}
      icon={icon}
      label={label}
      trailing={shortcut}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) onClick();
      }}
    />
  );
}

function getPlatformShortcut(key: string): string {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}

function CreateEntryGlyph({
  option,
  theme,
  size = 18,
}: {
  option: CreateEntryOption;
  theme?: FileIconThemeId | null;
  size?: number;
}) {
  return (
    <FileGlyphIcon
      name={option.iconName}
      type={option.iconType}
      size={size}
      theme={theme}
    />
  );
}

function getCreateEntryOption(kind: DesktopCreateEntryKind): CreateEntryOption {
  return CREATE_ENTRY_OPTIONS.find((option) => option.kind === kind) ?? CREATE_ENTRY_OPTIONS[0];
}

type DesktopFileTypeOption = {
  id: string;
  extension: string;
  experimentalSetting?: keyof ExperimentalSettings;
};

const DESKTOP_FILE_TYPE_OPTIONS = [
  { id: "none", extension: "" },
  { id: "markdown", extension: ".md" },
  { id: "json", extension: ".json" },
  { id: "jsonLines", extension: ".jsonl" },
  { id: "text", extension: ".txt" },
  { id: "csv", extension: ".csv" },
  { id: "html", extension: ".html" },
  { id: "app", extension: ".puppyoneapp", experimentalSetting: "enablePuppyoneAppFiles" },
  { id: "puppyflow", extension: ".puppyflow", experimentalSetting: "enablePuppyFlowFiles" },
  { id: "javascript", extension: ".js" },
  { id: "typescript", extension: ".ts" },
  { id: "tsx", extension: ".tsx" },
  { id: "yaml", extension: ".yml" },
  { id: "toml", extension: ".toml" },
  { id: "pdf", extension: ".pdf" },
  { id: "png", extension: ".png" },
  { id: "jpeg", extension: ".jpg" },
  { id: "zip", extension: ".zip" },
  { id: "tarball", extension: ".tar.gz" },
] satisfies DesktopFileTypeOption[];

export function getDesktopRenameDraft(node: DataNode): { nameValue: string; extensionValue: string } {
  if (node.type === "folder") return { nameValue: node.name, extensionValue: "" };

  const extension = getDesktopNodeExtension(node.name);
  if (!extension) return { nameValue: node.name, extensionValue: "" };

  return {
    nameValue: node.name.slice(0, -extension.length),
    extensionValue: extension,
  };
}

export function normalizeDesktopRenameName(draft: DesktopNodeActionMenuDraft): string {
  const baseName = draft.renameNameValue.trim();
  validateDesktopNodeName(baseName);

  if (draft.node.type === "folder") return baseName;

  const selectedExtension = normalizeDesktopExtension(draft.renameExtensionValue);
  const currentExtension = getDesktopNodeExtension(draft.node.name);
  const extension = selectedExtension === normalizeDesktopExtension(currentExtension)
    ? currentExtension
    : selectedExtension;
  const normalizedBaseName = extension && baseName.toLocaleLowerCase().endsWith(extension.toLocaleLowerCase())
    ? baseName.slice(0, -extension.length)
    : baseName;
  const nextName = `${normalizedBaseName}${extension}`;
  validateDesktopNodeName(nextName);
  return nextName;
}

export function validateDesktopNodeName(name: string): void {
  if (!name) throw new DesktopNodeNameError("name-required");
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    throw new DesktopNodeNameError("name-invalid");
  }
  if (name.includes("\0")) {
    throw new DesktopNodeNameError("name-unsupported");
  }
}

export function getDesktopFileTypeOptions(
  currentExtension: string,
  t: MessageFormatter,
  experimentalSettings?: ExperimentalSettings | null,
): Array<{ label: string; extension: string }> {
  const extension = normalizeDesktopExtension(currentExtension);
  const options = DESKTOP_FILE_TYPE_OPTIONS
    .filter((option) => !option.experimentalSetting || experimentalSettings?.[option.experimentalSetting] === true)
    .map(({ id, extension: optionExtension }) => ({
      label: t(`workspace.node.fileType.${id}`),
      extension: optionExtension,
    }));
  if (!extension || options.some((option) => option.extension === extension)) return options;

  return [
    options[0],
    { label: t("workspace.node.fileType.current", { extension: bidiIsolate(extension) }), extension },
    ...options.slice(1),
  ];
}

export function normalizeDesktopExtension(value: string): string {
  const trimmed = value.trim().toLocaleLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

export function getDesktopNodeExtension(name: string): string {
  if (!name) return "";
  if (name.startsWith(".") && name.indexOf(".", 1) === -1) return "";

  const extension = getMatchedExtension(name);
  if (!extension) return "";

  const suffix = `.${extension}`;
  if (!name.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())) return "";
  if (name.length <= suffix.length) return "";
  return name.slice(-suffix.length);
}

export function formatDesktopExtensionLabel(extension: string, t: MessageFormatter): string {
  return extension || t("workspace.node.fileType.noExtensionShort");
}

export function defaultCreateName(kind: DesktopCreateEntryKind, t: MessageFormatter): string {
  return t(`workspace.node.create.kind.${kind}.defaultName`);
}

export type DesktopCreateEntryTemplates = Readonly<{
  csvHeaders: readonly [string, string];
  puppyFlow: PuppyFlowDocumentDefaults;
  untitledAppName: string;
}>;

export function getCreateEntryInitialContent(
  kind: DesktopCreateEntryKind,
  templates: DesktopCreateEntryTemplates,
): string {
  if (kind === "json") return "{}\n";
  if (kind === "csv") return `${templates.csvHeaders.join(",")}\n`;
  if (kind === "app") {
    return [
      "{",
      '  "type": "puppyone.app",',
      '  "version": 1,',
      `  "name": ${JSON.stringify(templates.untitledAppName)},`,
      '  "launch": {',
      '    "kind": "local-server",',
      '    "command": ["node", "server.mjs"],',
      '    "cwd": ".",',
      '    "env": {',
      '      "HOST": "127.0.0.1",',
      '      "PORT": "${port}"',
      "    },",
      '    "url": "http://127.0.0.1:${port}/",',
      '    "health": {',
      '      "path": "/",',
      '      "expectStatus": 200',
      "    }",
      "  },",
      '  "permissions": {',
      '    "workspace": ["read"]',
      "  }",
      "}",
      "",
    ].join("\n");
  }
  if (kind === "puppyflow") {
    return serializePuppyFlowDocument(createDefaultPuppyFlowDocument(templates.puppyFlow));
  }
  return "";
}

export function normalizeCreateEntryName(kind: DesktopCreateEntryKind, value: string): string {
  const name = value.trim();
  if (!name) {
    throw new DesktopNodeNameError("name-required");
  }
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    throw new DesktopNodeNameError("name-invalid");
  }
  if (name.includes("\0")) {
    throw new DesktopNodeNameError("name-unsupported");
  }
  if (kind === "markdown") {
    return ensureCreateEntryExtension(name, /\.(md|markdown|mdx)$/i, ".md");
  }
  if (kind === "text") {
    return getDesktopNodeExtension(name) ? name : `${name}.txt`;
  }
  if (kind === "json") {
    return ensureCreateEntryExtension(name, /\.(json|jsonl)$/i, ".json");
  }
  if (kind === "csv") {
    return ensureCreateEntryExtension(name, /\.(csv|tsv)$/i, ".csv");
  }
  if (kind === "app") {
    return ensureCreateEntryExtension(name, /\.puppyoneapp$/i, ".puppyoneapp");
  }
  if (kind === "puppyflow") {
    return ensureCreateEntryExtension(name, /\.(puppyflow|puppyflow\.json)$/i, ".puppyflow");
  }
  return name;
}

function ensureCreateEntryExtension(name: string, extensionPattern: RegExp, fallbackExtension: string): string {
  if (extensionPattern.test(name)) return name;
  return `${name}${fallbackExtension}`;
}

function getCreateEntryExtensionNote(kind: DesktopCreateEntryKind, t: MessageFormatter): string | null {
  if (kind === "folder") return null;
  return t(`workspace.node.create.kind.${kind}.extensionNote`);
}

function getCreateEntryOptionLabel(kind: DesktopCreateEntryKind, t: MessageFormatter): string {
  return t(`workspace.node.create.kind.${kind}.label`);
}

function getCreateEntryDialogTitle(kind: DesktopCreateEntryKind, t: MessageFormatter): string {
  return t(`workspace.node.create.kind.${kind}.title`);
}

export function toDesktopNodeActionError(error: unknown): DesktopNodeActionError {
  if (error instanceof DesktopNodeNameError) return Object.freeze({ code: error.code });
  return Object.freeze({
    code: "operation-failed",
    detail: error instanceof Error ? error.message : String(error),
  });
}

function formatDesktopNodeActionError(
  error: DesktopNodeActionError | null,
  t: MessageFormatter,
): string | null {
  if (!error) return null;
  if (error.code === "name-required") return t("workspace.node.error.nameRequired");
  if (error.code === "name-invalid") return t("workspace.node.error.nameInvalid");
  if (error.code === "name-unsupported") return t("workspace.node.error.nameUnsupported");
  if (error.code === "delete-partial") {
    return t("workspace.node.error.deletePartial", {
      deleted: error.deletedCount,
      failed: error.failedCount,
      detail: bidiIsolate(error.detail),
    });
  }
  return t("workspace.node.error.operationFailedDetail", { detail: bidiIsolate(error.detail) });
}

type DesktopNodeNameErrorCode = "name-required" | "name-invalid" | "name-unsupported";

class DesktopNodeNameError extends Error {
  readonly code: DesktopNodeNameErrorCode;

  constructor(code: DesktopNodeNameError["code"]) {
    super(code);
    this.name = "DesktopNodeNameError";
    this.code = code;
  }
}

export function uniqueCreateEntryName(defaultName: string, existingNames: Set<string>): string {
  if (!existingNames.has(defaultName)) return defaultName;

  const extensionIndex = defaultName.lastIndexOf(".");
  const hasExtension = extensionIndex > 0;
  const stem = hasExtension ? defaultName.slice(0, extensionIndex) : defaultName;
  const extension = hasExtension ? defaultName.slice(extensionIndex) : "";

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${stem} ${index}${extension}`;
    if (!existingNames.has(candidate)) return candidate;
  }

  return `${stem} ${Date.now()}${extension}`;
}

export function rectToCreateEntryAnchor(
  rect: DOMRect,
  placement: DesktopCreateEntryAnchor["placement"] = "below-start",
): DesktopCreateEntryAnchor {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    placement,
  };
}

function getNodeActionMenuPosition(anchor: DesktopCreateEntryAnchor, menuWidth: number, estimatedHeight: number) {
  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
  const maxLeft = Math.max(CREATE_ENTRY_MENU_MARGIN, viewportWidth - menuWidth - CREATE_ENTRY_MENU_MARGIN);
  const maxTop = Math.max(CREATE_ENTRY_MENU_MARGIN, viewportHeight - estimatedHeight - CREATE_ENTRY_MENU_MARGIN);

  return {
    left: clampNumber(anchor.left, CREATE_ENTRY_MENU_MARGIN, maxLeft),
    top: clampNumber(anchor.bottom + 4, CREATE_ENTRY_MENU_MARGIN, maxTop),
  };
}

function getCreateEntryMenuPosition(anchor: DesktopCreateEntryAnchor) {
  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
  const maxLeft = Math.max(CREATE_ENTRY_MENU_MARGIN, viewportWidth - CREATE_ENTRY_MENU_WIDTH - CREATE_ENTRY_MENU_MARGIN);
  const maxTop = Math.max(CREATE_ENTRY_MENU_MARGIN, viewportHeight - CREATE_ENTRY_MENU_ESTIMATED_HEIGHT - CREATE_ENTRY_MENU_MARGIN);
  const gap = 6;
  const belowTop = anchor.bottom + gap;
  const aboveTop = anchor.top - CREATE_ENTRY_MENU_ESTIMATED_HEIGHT - gap;
  const belowFits = belowTop <= maxTop;
  const aboveFits = aboveTop >= CREATE_ENTRY_MENU_MARGIN;
  const placement = anchor.placement ?? "below-start";
  const alignEnd = placement.endsWith("-end");
  const preferredTop = placement === "auto-start"
    ? (belowFits || !aboveFits ? belowTop : aboveTop)
    : placement === "auto-end"
      ? (belowFits || !aboveFits ? belowTop : aboveTop)
    : placement === "above-start" || placement === "above-end"
      ? (aboveFits || !belowFits ? aboveTop : belowTop)
      : (belowFits || !aboveFits ? belowTop : aboveTop);
  const preferredLeft = alignEnd ? anchor.right - CREATE_ENTRY_MENU_WIDTH : anchor.left;

  return {
    left: clampNumber(preferredLeft, CREATE_ENTRY_MENU_MARGIN, maxLeft),
    top: clampNumber(preferredTop, CREATE_ENTRY_MENU_MARGIN, maxTop),
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
