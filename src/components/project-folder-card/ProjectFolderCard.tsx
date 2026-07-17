import { Plus } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { bidiIsolate, useLocalization, type MessageFormatter } from "@puppyone/localization";

export const PROJECT_FOLDER_CARD_MIN_WIDTH = 210;
export const PROJECT_FOLDER_CARD_MAX_SIZE = 260;
export const PROJECT_FOLDER_CARD_GAP = 60;

export type ProjectFolderPreviewItem = {
  id: string;
  name: string;
  icon: ReactNode;
};

export type ProjectFolderCardFooter = {
  statusConnected?: boolean;
  updatedLabel?: string;
  connectionCount?: number;
};

export function ProjectFolderCard({
  title,
  badge,
  previewItems,
  previewLoading,
  previewError,
  emptyLabel,
  selected = false,
  footer,
  actions,
  onSelect,
}: {
  title: string;
  badge?: string | null;
  previewItems: ProjectFolderPreviewItem[];
  previewLoading?: boolean;
  previewError?: boolean;
  emptyLabel?: string | null;
  selected?: boolean;
  footer?: ProjectFolderCardFooter;
  actions?: ReactNode;
  onSelect: () => void;
}) {
  const { t } = useLocalization();
  const handleKeyboardSelect = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <article
      className={`desktop-project-folder-card ${selected ? "selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={t("cloud.project.open", { project: bidiIsolate(title) })}
      aria-current={selected ? "page" : undefined}
      onClick={onSelect}
      onKeyDown={handleKeyboardSelect}
    >
      <div className="desktop-project-folder-card-tab">
        <span title={title}>{title}</span>
        {badge && <em>{badge}</em>}
      </div>

      <div className="desktop-project-folder-card-body">
        {actions && <div className="desktop-project-folder-card-actions">{actions}</div>}

        <div className="desktop-project-folder-card-preview">
          <ProjectFolderPreview
            items={previewItems}
            loading={previewLoading}
            error={previewError}
            emptyLabel={emptyLabel}
            t={t}
          />
        </div>

        <ProjectFolderCardFooterBar footer={footer} t={t} />
      </div>
    </article>
  );
}

export function ProjectFolderCardSkeleton() {
  const { t } = useLocalization();
  return (
    <div className="desktop-project-folder-card skeleton" aria-hidden="true">
      <div className="desktop-project-folder-card-tab">
        <span />
      </div>
      <div className="desktop-project-folder-card-body">
        <div className="desktop-project-folder-preview-skeleton">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index}>
              <span />
              <em />
            </div>
          ))}
        </div>
        <ProjectFolderCardFooterBar footer={{ updatedLabel: " " }} t={t} />
      </div>
    </div>
  );
}

export function ProjectFolderNewCard({
  label,
  loading,
  disabled = false,
  onClick,
}: {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="desktop-project-folder-new-card"
      type="button"
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      onClick={onClick}
    >
      <div aria-hidden="true" />
      <span>
        <Plus size={30} />
        <strong>{label}</strong>
      </span>
    </button>
  );
}

function ProjectFolderPreview({
  items,
  loading,
  error,
  emptyLabel,
  t,
}: {
  items: ProjectFolderPreviewItem[];
  loading?: boolean;
  error?: boolean;
  emptyLabel?: string | null;
  t: MessageFormatter;
}) {
  if (items.length > 0) {
    return (
      <div className="desktop-project-folder-preview-grid">
        {items.map((item) => (
          <div key={item.id} className="desktop-project-folder-preview-item">
            <span>{item.icon}</span>
            <strong title={item.name}>{item.name}</strong>
          </div>
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="desktop-project-folder-preview-skeleton" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index}>
            <span />
            <em />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="desktop-project-folder-preview-empty">
      <p>{error ? t("cloud.project.previewUnavailable") : emptyLabel || t("cloud.project.empty")}</p>
    </div>
  );
}

function ProjectFolderCardFooterBar({
  footer,
  t,
}: {
  footer?: ProjectFolderCardFooter;
  t: MessageFormatter;
}) {
  const connectionCount = footer?.connectionCount ?? 0;
  return (
    <div className="desktop-project-folder-card-footer">
      <span
        className={`desktop-project-folder-status-dot ${footer?.statusConnected ? "connected" : ""}`}
        aria-hidden="true"
      />
      <span>{footer?.updatedLabel || t("cloud.project.recentlyUpdated")}</span>
      {connectionCount > 0 && (
        <>
          <i aria-hidden="true">·</i>
          <span>{t("cloud.project.connectionCount", { count: connectionCount })}</span>
        </>
      )}
    </div>
  );
}
