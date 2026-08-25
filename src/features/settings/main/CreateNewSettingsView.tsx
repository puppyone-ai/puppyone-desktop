import { useMemo, useState, type DragEvent } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
  LockKeyhole,
  RotateCcw,
  Workflow,
} from "lucide-react";
import {
  FileGlyphIcon,
  type DataNode,
  type FileIconThemeId,
} from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import {
  CREATE_NEW_MENU_VERSION,
  cloneDefaultCreateNewMenuSettings,
  isCreateNewItemAvailable,
  type CreateNewItemId,
  type CreateNewMenuItem,
  type CreateNewMenuPlacement,
  type CreateNewMenuSettings,
  type ExperimentalSettings,
} from "../../../preferences";
import { getCreateEntryMenuItem } from "../../create-new/createEntryMenuRegistry";
import { SettingsSectionHeader } from "../components";

type DragTarget = {
  edge: "before" | "after";
  kind: CreateNewItemId;
  placement: CreateNewMenuPlacement;
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
  const [draggedKind, setDraggedKind] = useState<CreateNewItemId | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const defaultSettings = useMemo(() => cloneDefaultCreateNewMenuSettings(), []);
  const mainItems = settings.items.filter((item) => item.placement === "main");
  const submenuItems = settings.items.filter((item) => item.placement === "submenu");
  const visibleSubmenu = submenuItems.some((item) => (
    item.enabled && isCreateNewItemAvailable(item.kind, experimentalSettings)
  ));
  const defaultsRestored = menuSettingsEqual(settings, defaultSettings);

  const commitItems = (items: CreateNewMenuItem[]) => {
    onChange({
      version: CREATE_NEW_MENU_VERSION,
      items: groupItemsByPlacement(items),
    });
  };

  const updateEnabled = (kind: CreateNewItemId, enabled: boolean) => {
    commitItems(settings.items.map((item) => (
      item.kind === kind ? { ...item, enabled } : item
    )));
  };

  const moveWithinGroup = (kind: CreateNewItemId, offset: -1 | 1) => {
    const item = settings.items.find((candidate) => candidate.kind === kind);
    if (!item) return;
    const group = settings.items.filter((candidate) => candidate.placement === item.placement);
    const sourceIndex = group.findIndex((candidate) => candidate.kind === kind);
    const targetIndex = sourceIndex + offset;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= group.length) return;
    const reordered = [...group];
    const [source] = reordered.splice(sourceIndex, 1);
    if (!source) return;
    reordered.splice(targetIndex, 0, source);
    commitItems([
      ...settings.items.filter((candidate) => candidate.placement !== item.placement),
      ...reordered,
    ]);
  };

  const moveToPlacement = (kind: CreateNewItemId, placement: CreateNewMenuPlacement) => {
    const source = settings.items.find((item) => item.kind === kind);
    if (!source || source.placement === placement) return;
    commitItems([
      ...settings.items.filter((item) => item.kind !== kind),
      { ...source, placement },
    ]);
  };

  const dropItem = (sourceKind: CreateNewItemId, target: DragTarget) => {
    if (sourceKind === target.kind) return;
    const source = settings.items.find((item) => item.kind === sourceKind);
    if (!source) return;
    const remaining = settings.items.filter((item) => item.kind !== sourceKind);
    const targetGroup = remaining.filter((item) => item.placement === target.placement);
    const targetIndex = targetGroup.findIndex((item) => item.kind === target.kind);
    if (targetIndex < 0) return;
    targetGroup.splice(
      target.edge === "before" ? targetIndex : targetIndex + 1,
      0,
      { ...source, placement: target.placement },
    );
    commitItems([
      ...remaining.filter((item) => item.placement !== target.placement),
      ...targetGroup,
    ]);
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
    placement: CreateNewMenuPlacement,
    kind: CreateNewItemId,
  ) => {
    if (!draggedKind || draggedKind === kind) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const edge = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setDragTarget({ kind, edge, placement });
  };

  const clearDragState = () => {
    setDraggedKind(null);
    setDragTarget(null);
  };

  const renderItem = (
    item: CreateNewMenuItem,
    index: number,
    group: readonly CreateNewMenuItem[],
  ) => {
    const visual = getCreateEntryMenuItem(item.kind);
    const label = t(`workspace.node.create.kind.${item.kind}.label`);
    const available = isCreateNewItemAvailable(item.kind, experimentalSettings);
    const moveTarget: CreateNewMenuPlacement = item.placement === "main" ? "submenu" : "main";
    const moveLabel = t(
      item.placement === "main"
        ? "settings.createNew.moveToSubmenu"
        : "settings.createNew.moveToMainMenu",
      { type: label },
    );
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
        onDragOver={(event) => handleDragOver(event, item.placement, item.kind)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const sourceKind = event.dataTransfer.getData("text/plain") as CreateNewItemId;
          const target = dragTarget ?? {
            kind: item.kind,
            edge: "before" as const,
            placement: item.placement,
          };
          dropItem(sourceKind, target);
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
        <span className="desktop-create-new-row-label">{label}</span>
        <div className="desktop-create-new-row-controls">
          <button
            className="desktop-create-new-placement-button"
            type="button"
            aria-label={moveLabel}
            title={moveLabel}
            onClick={() => moveToPlacement(item.kind, moveTarget)}
          >
            {item.placement === "main" ? (
              <ChevronRight className="po-directional-icon" size={14} aria-hidden="true" />
            ) : (
              <ChevronLeft className="po-directional-icon" size={14} aria-hidden="true" />
            )}
          </button>
          <span className="desktop-create-new-order-controls">
            <button
              type="button"
              disabled={index === 0}
              aria-label={t("settings.createNew.moveUp", { type: label })}
              title={t("settings.createNew.moveUp", { type: label })}
              onClick={() => moveWithinGroup(item.kind, -1)}
            >
              <ChevronUp size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={index === group.length - 1}
              aria-label={t("settings.createNew.moveDown", { type: label })}
              title={t("settings.createNew.moveDown", { type: label })}
              onClick={() => moveWithinGroup(item.kind, 1)}
            >
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          </span>
          <label
            className="desktop-settings-switch"
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
        </div>
      </div>
    );
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
            <section className="desktop-create-new-menu-editor">
              <header className="desktop-create-new-group-header">
                <strong>{t("settings.createNew.mainMenu.title")}</strong>
                <span>{t("settings.createNew.mainMenu.detail")}</span>
              </header>
              <div className="desktop-create-new-menu-list" role="list">
                <div className="desktop-create-new-row desktop-create-new-row-fixed" role="listitem">
                  <span className="desktop-create-new-fixed-marker" aria-hidden="true">
                    <LockKeyhole size={12} />
                  </span>
                  <CreateNewGlyph iconName="folder" iconType="folder" theme={fileIconTheme} />
                  <span className="desktop-create-new-row-label">
                    {t("workspace.node.create.kind.folder.label")}
                  </span>
                  <span className="desktop-create-new-fixed-label">
                    {t("settings.createNew.fixed")}
                  </span>
                </div>
                <div className="desktop-create-new-menu-divider" aria-hidden="true" />
                {mainItems.map((item, index) => renderItem(item, index, mainItems))}
                {visibleSubmenu && (
                  <div className="desktop-create-new-row desktop-create-new-submenu-link" role="listitem">
                    <span aria-hidden="true" />
                    <span className="desktop-create-new-submenu-glyph" aria-hidden="true">
                      <Workflow size={15} />
                    </span>
                    <span className="desktop-create-new-row-label">
                      {t("workspace.node.customFiles")}
                    </span>
                    <ChevronRight className="po-directional-icon" size={14} aria-hidden="true" />
                  </div>
                )}
              </div>
            </section>

            <section className="desktop-create-new-menu-editor">
              <header className="desktop-create-new-group-header">
                <strong>{t("settings.createNew.submenu.title")}</strong>
                <span>{t("settings.createNew.submenu.detail")}</span>
              </header>
              <div className="desktop-create-new-menu-list" role="list">
                {submenuItems.map((item, index) => renderItem(item, index, submenuItems))}
                {submenuItems.length === 0 && (
                  <div className="desktop-create-new-empty">
                    {t("settings.createNew.submenu.empty")}
                  </div>
                )}
              </div>
            </section>

            <footer className="desktop-create-new-footer">
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
          </div>
        </div>
      </div>
    </section>
  );
}

function groupItemsByPlacement(items: readonly CreateNewMenuItem[]): CreateNewMenuItem[] {
  return [
    ...items.filter((item) => item.placement === "main"),
    ...items.filter((item) => item.placement === "submenu"),
  ];
}

function menuSettingsEqual(left: CreateNewMenuSettings, right: CreateNewMenuSettings): boolean {
  return left.items.length === right.items.length
    && left.items.every((item, index) => {
      const candidate = right.items[index];
      return candidate?.kind === item.kind
        && candidate.enabled === item.enabled
        && candidate.placement === item.placement;
    });
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
