import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  CircleMinus,
  GripVertical,
  LockKeyhole,
  Plus,
  RotateCcw,
} from "lucide-react";
import {
  FileGlyphIcon,
  type DataNode,
  type FileIconThemeId,
} from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import { DesktopMenuItem, DesktopMenuSurface } from "../../../components/DesktopMenu";
import {
  CREATE_NEW_ITEM_IDS,
  CREATE_NEW_MENU_VERSION,
  cloneDefaultCreateNewMenuSettings,
  isCreateNewItemAvailable,
  type CreateNewItemId,
  type CreateNewMenuSettings,
  type ExperimentalSettings,
} from "../../../preferences";
import { getCreateEntryMenuItem } from "../../create-new/createEntryMenuRegistry";
import { SettingsSectionHeader } from "../components";

type DragTarget = {
  edge: "before" | "after";
  kind: CreateNewItemId;
};

export function CreateNewSettingsView({
  settings,
  experimentalSettings,
  fileIconTheme,
  onChange,
}: {
  settings: CreateNewMenuSettings;
  experimentalSettings: ExperimentalSettings;
  fileIconTheme: FileIconThemeId;
  onChange: (settings: CreateNewMenuSettings) => void;
}) {
  const { t } = useLocalization();
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [draggedKind, setDraggedKind] = useState<CreateNewItemId | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const presentKinds = useMemo(
    () => new Set(settings.items.map((item) => item.kind)),
    [settings.items],
  );
  const addableKinds = CREATE_NEW_ITEM_IDS.filter((kind) => (
    !presentKinds.has(kind) && isCreateNewItemAvailable(kind, experimentalSettings)
  ));
  const defaultsRestored = settings.items.length === 5
    && settings.items[0]?.kind === "markdown"
    && settings.items[0]?.enabled
    && settings.items[1]?.kind === "contextMap"
    && settings.items[1]?.enabled
    && settings.items[2]?.kind === "csv"
    && settings.items[2]?.enabled
    && settings.items[3]?.kind === "html"
    && settings.items[3]?.enabled
    && settings.items[4]?.kind === "slides"
    && settings.items[4]?.enabled;

  useEffect(() => {
    if (!addMenuOpen) return;

    const frame = window.requestAnimationFrame(() => {
      addMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && addMenuRef.current?.contains(event.target)) return;
      setAddMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAddMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [addMenuOpen]);

  useEffect(() => {
    if (addableKinds.length === 0) setAddMenuOpen(false);
  }, [addableKinds.length]);

  const updateEnabled = (kind: CreateNewItemId, enabled: boolean) => {
    onChange({
      version: CREATE_NEW_MENU_VERSION,
      items: settings.items.map((item) => (
        item.kind === kind ? { ...item, enabled } : item
      )),
    });
  };

  const moveItem = (kind: CreateNewItemId, offset: -1 | 1) => {
    const sourceIndex = settings.items.findIndex((item) => item.kind === kind);
    const targetIndex = sourceIndex + offset;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= settings.items.length) return;
    const items = [...settings.items];
    const [item] = items.splice(sourceIndex, 1);
    if (!item) return;
    items.splice(targetIndex, 0, item);
    onChange({ version: CREATE_NEW_MENU_VERSION, items });
  };

  const dropItem = (sourceKind: CreateNewItemId, target: DragTarget) => {
    if (sourceKind === target.kind) return;
    const sourceIndex = settings.items.findIndex((item) => item.kind === sourceKind);
    if (sourceIndex < 0) return;

    const items = [...settings.items];
    const [item] = items.splice(sourceIndex, 1);
    if (!item) return;
    const targetIndex = items.findIndex((candidate) => candidate.kind === target.kind);
    if (targetIndex < 0) return;
    items.splice(target.edge === "before" ? targetIndex : targetIndex + 1, 0, item);
    onChange({ version: CREATE_NEW_MENU_VERSION, items });
  };

  const handleDragStart = (
    event: DragEvent<HTMLButtonElement>,
    kind: CreateNewItemId,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", kind);
    setDraggedKind(kind);
  };

  const handleDragOver = (
    event: DragEvent<HTMLDivElement>,
    kind: CreateNewItemId,
  ) => {
    if (!draggedKind || draggedKind === kind) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const edge = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setDragTarget({ kind, edge });
  };

  const clearDragState = () => {
    setDraggedKind(null);
    setDragTarget(null);
  };

  const addType = (kind: CreateNewItemId) => {
    onChange({ version: CREATE_NEW_MENU_VERSION, items: [...settings.items, { kind, enabled: true }] });
    setAddMenuOpen(false);
  };

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section desktop-create-new-settings">
          <SettingsSectionHeader
            title={t("settings.createNew.title")}
            detail={t("settings.createNew.detail")}
          />

          <div className="desktop-create-new-layout">
            <section
              className="desktop-create-new-card desktop-create-new-editor"
              aria-labelledby="desktop-create-new-items-title"
            >
              <header className="desktop-create-new-card-header">
                <strong id="desktop-create-new-items-title">
                  {t("settings.createNew.fileTypes.title")}
                </strong>
              </header>

              <div className="desktop-create-new-list">
                <div className="desktop-create-new-row desktop-create-new-row-fixed">
                  <span className="desktop-create-new-fixed-marker" aria-hidden="true">
                    <LockKeyhole size={12} />
                  </span>
                  <CreateNewGlyph
                    iconName="folder"
                    iconType="folder"
                    theme={fileIconTheme}
                  />
                  <span className="desktop-create-new-row-label">
                    <strong>{t("workspace.node.create.kind.folder.label")}</strong>
                  </span>
                </div>

                <div className="desktop-create-new-file-list" role="list">
                  {settings.items.map((item, index) => {
                    const visual = getCreateEntryMenuItem(item.kind);
                    const label = t(`workspace.node.create.kind.${item.kind}.label`);
                    const available = isCreateNewItemAvailable(item.kind, experimentalSettings);
                    const dragBefore = dragTarget?.kind === item.kind && dragTarget.edge === "before";
                    const dragAfter = dragTarget?.kind === item.kind && dragTarget.edge === "after";
                    return (
                      <div
                        className="desktop-create-new-row desktop-create-new-file-row"
                        data-drag-before={dragBefore || undefined}
                        data-drag-after={dragAfter || undefined}
                        data-dragging={draggedKind === item.kind || undefined}
                        data-unavailable={!available || undefined}
                        key={item.kind}
                        role="listitem"
                        onDragOver={(event) => handleDragOver(event, item.kind)}
                        onDrop={(event) => {
                          event.preventDefault();
                          const sourceKind = event.dataTransfer.getData("text/plain") as CreateNewItemId;
                          const target = dragTarget ?? { kind: item.kind, edge: "before" };
                          if (CREATE_NEW_ITEM_IDS.includes(sourceKind)) dropItem(sourceKind, target);
                          clearDragState();
                        }}
                      >
                        <button
                          className="desktop-create-new-drag-handle"
                          type="button"
                          draggable
                          aria-label={t("settings.createNew.dragToReorder", { type: label })}
                          title={t("settings.createNew.dragToReorder", { type: label })}
                          onDragStart={(event) => handleDragStart(event, item.kind)}
                          onDragEnd={clearDragState}
                        >
                          <GripVertical size={14} aria-hidden="true" />
                        </button>
                        <CreateNewGlyph
                          iconName={visual.iconName}
                          iconType={visual.iconType}
                          theme={fileIconTheme}
                        />
                        <span className="desktop-create-new-row-label">
                          <strong>{label}</strong>
                        </span>
                        <div className="desktop-create-new-row-controls">
                          <label
                            className="desktop-settings-switch desktop-create-new-switch"
                            title={!available ? t("settings.createNew.unavailable") : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={item.enabled}
                              disabled={!available}
                              aria-label={t("settings.createNew.enable", { type: label })}
                              onChange={(event) => updateEnabled(item.kind, event.target.checked)}
                            />
                            <span aria-hidden="true" />
                          </label>
                          <span className="desktop-create-new-order-controls">
                            <button
                              type="button"
                              disabled={index === 0}
                              aria-label={t("settings.createNew.moveUp", { type: label })}
                              title={t("settings.createNew.moveUp", { type: label })}
                              onClick={() => moveItem(item.kind, -1)}
                            >
                              <ChevronUp size={13} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              disabled={index === settings.items.length - 1}
                              aria-label={t("settings.createNew.moveDown", { type: label })}
                              title={t("settings.createNew.moveDown", { type: label })}
                              onClick={() => moveItem(item.kind, 1)}
                            >
                              <ChevronDown size={13} aria-hidden="true" />
                            </button>
                          </span>
                          <button
                            className="desktop-create-new-remove-button"
                            type="button"
                            aria-label={t("settings.createNew.remove", { type: label })}
                            title={t("settings.createNew.remove", { type: label })}
                            onClick={() => onChange({
                              version: CREATE_NEW_MENU_VERSION,
                              items: settings.items.filter((candidate) => candidate.kind !== item.kind),
                            })}
                          >
                            <CircleMinus size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <footer className="desktop-create-new-card-footer">
                <div className="desktop-create-new-add-control" ref={addMenuRef}>
                  <button
                    className="desktop-settings-action desktop-create-new-add-button"
                    type="button"
                    disabled={addableKinds.length === 0}
                    aria-haspopup="menu"
                    aria-expanded={addMenuOpen}
                    title={addableKinds.length === 0 ? t("settings.createNew.addEmpty") : undefined}
                    onClick={() => setAddMenuOpen((open) => !open)}
                  >
                    <Plus size={13} aria-hidden="true" />
                    <span>{t("settings.createNew.add")}</span>
                  </button>
                  {addMenuOpen && (
                    <DesktopMenuSurface
                      className="desktop-create-new-add-menu"
                      ariaLabel={t("settings.createNew.addMenu")}
                    >
                      {addableKinds.map((kind) => {
                        const visual = getCreateEntryMenuItem(kind);
                        return (
                          <DesktopMenuItem
                            key={kind}
                            icon={(
                              <CreateNewGlyph
                                iconName={visual.iconName}
                                iconType={visual.iconType}
                                theme={fileIconTheme}
                                size={16}
                              />
                            )}
                            label={t(`workspace.node.create.kind.${kind}.label`)}
                            detail={visual.extension}
                            onClick={() => addType(kind)}
                          />
                        );
                      })}
                    </DesktopMenuSurface>
                  )}
                </div>
                <button
                  className="desktop-settings-action"
                  type="button"
                  disabled={defaultsRestored}
                  onClick={() => onChange(cloneDefaultCreateNewMenuSettings())}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  <span>{t("settings.createNew.restoreDefaults")}</span>
                </button>
              </footer>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}

function CreateNewGlyph({
  iconName,
  iconType,
  theme,
  size = 18,
}: {
  iconName: string;
  iconType: DataNode["type"];
  theme: FileIconThemeId;
  size?: number;
}) {
  return (
    <span className="desktop-create-new-glyph" aria-hidden="true">
      <FileGlyphIcon
        name={iconName}
        type={iconType}
        size={size}
        theme={theme}
      />
    </span>
  );
}
