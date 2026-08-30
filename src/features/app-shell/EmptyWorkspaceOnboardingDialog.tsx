import { bidiIsolate, useLocalization, type MessageFormatter } from "@puppyone/localization";
import {
  BookOpenCheck,
  Check,
  NotebookPen,
  SquareDashed,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
  DesktopDialogRoot,
  DesktopDialogSurface,
} from "../../components/DesktopDialog";
import { DesktopOverlayLayer } from "./DesktopOverlayPortal";

export type WorkspaceRootOnboardingStatus = "loading" | "empty" | "ready" | "unavailable";
export type EmptyWorkspaceStarterId = "blank" | "get-started" | "notes" | "data";

export type EmptyWorkspaceStarterSelection = Readonly<{
  id: EmptyWorkspaceStarterId;
  file: Readonly<{
    path: string;
    content: string;
  }> | null;
}>;

export const FIRST_PROJECT_STARTER_STORAGE_KEY = "puppyone.desktop.firstProjectStarter.v1";

const STARTER_OPTIONS: ReadonlyArray<Readonly<{
  id: EmptyWorkspaceStarterId;
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
}>> = [
  {
    id: "blank",
    icon: SquareDashed,
    titleKey: "workspace.emptyOnboarding.option.blank.title",
    descriptionKey: "workspace.emptyOnboarding.option.blank.description",
  },
  {
    id: "get-started",
    icon: BookOpenCheck,
    titleKey: "workspace.emptyOnboarding.option.getStarted.title",
    descriptionKey: "workspace.emptyOnboarding.option.getStarted.description",
  },
  {
    id: "notes",
    icon: NotebookPen,
    titleKey: "workspace.emptyOnboarding.option.notes.title",
    descriptionKey: "workspace.emptyOnboarding.option.notes.description",
  },
  {
    id: "data",
    icon: Table2,
    titleKey: "workspace.emptyOnboarding.option.data.title",
    descriptionKey: "workspace.emptyOnboarding.option.data.description",
  },
];

export function resolveWorkspaceRootOnboardingStatus({
  rootLoading,
  loadError,
  rootEntryCount,
}: {
  rootLoading: boolean;
  loadError: string | null;
  rootEntryCount: number;
}): WorkspaceRootOnboardingStatus {
  if (rootLoading) return "loading";
  if (loadError) return "unavailable";
  return rootEntryCount === 0 ? "empty" : "ready";
}

export function shouldShowFirstProjectStarter({
  eligible,
  completed,
  workspaceStatus,
}: {
  eligible: boolean;
  completed: boolean;
  workspaceStatus: WorkspaceRootOnboardingStatus | null;
}) {
  return eligible && !completed && workspaceStatus === "empty";
}

export function readFirstProjectStarterCompleted(storage: Pick<Storage, "getItem"> | null = getLocalStorage()) {
  if (!storage) return false;
  try {
    return storage.getItem(FIRST_PROJECT_STARTER_STORAGE_KEY) === "completed";
  } catch {
    return false;
  }
}

export function markFirstProjectStarterCompleted(storage: Pick<Storage, "setItem"> | null = getLocalStorage()) {
  if (!storage) return;
  try {
    storage.setItem(FIRST_PROJECT_STARTER_STORAGE_KEY, "completed");
  } catch {
    // A denied storage write should not block the user's explicit selection.
  }
}

export function resolveEmptyWorkspaceStarterSelection(
  id: EmptyWorkspaceStarterId,
  t: MessageFormatter,
): EmptyWorkspaceStarterSelection {
  if (id === "blank") return { id, file: null };

  if (id === "get-started") {
    return {
      id,
      file: {
        path: t("workspace.emptyOnboarding.option.getStarted.fileName"),
        content: [
          `# ${t("workspace.emptyOnboarding.option.getStarted.documentTitle")}`,
          "",
          t("workspace.emptyOnboarding.option.getStarted.documentIntro"),
          "",
          `- ${t("workspace.emptyOnboarding.option.getStarted.step.files")}`,
          `- ${t("workspace.emptyOnboarding.option.getStarted.step.agents")}`,
          `- ${t("workspace.emptyOnboarding.option.getStarted.step.terminal")}`,
          "",
        ].join("\n"),
      },
    };
  }

  if (id === "notes") {
    return {
      id,
      file: {
        path: t("workspace.emptyOnboarding.option.notes.fileName"),
        content: `# ${t("workspace.emptyOnboarding.option.notes.documentTitle")}\n\n`,
      },
    };
  }

  const headers = [1, 2, 3].map((number) => t("workspace.node.csvColumn", { number }));
  return {
    id,
    file: {
      path: t("workspace.emptyOnboarding.option.data.fileName"),
      content: `${headers.join(",")}\n,,\n,,\n`,
    },
  };
}

export function EmptyWorkspaceOnboardingDialog({
  onConfirm,
}: {
  onConfirm: (selection: EmptyWorkspaceStarterSelection) => Promise<void>;
}) {
  const { t } = useLocalization();
  const [selectedId, setSelectedId] = useState<EmptyWorkspaceStarterId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = t("workspace.emptyOnboarding.title");

  const confirm = async () => {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(resolveEmptyWorkspaceStarterSelection(selectedId, t));
    } catch (nextError) {
      setError(t("workspace.emptyOnboarding.error", {
        detail: bidiIsolate(nextError instanceof Error ? nextError.message : String(nextError)),
      }));
      setSubmitting(false);
    }
  };

  return (
    <DesktopOverlayLayer>
      <DesktopDialogRoot dismissalPolicy="action-required">
        <DesktopDialogSurface
          ariaLabel={title}
          className="empty-workspace-starter-dialog"
          width={520}
        >
          <header className="desktop-dialog-header empty-workspace-starter-header">
            <div className="desktop-dialog-title-row">
              <h2>{title}</h2>
            </div>
          </header>

          <div className="desktop-dialog-body empty-workspace-starter-body">
            <p className="empty-workspace-starter-intro">
              {t("workspace.emptyOnboarding.description")}
            </p>
            <div
              className="empty-workspace-starter-grid"
              role="radiogroup"
              aria-label={t("workspace.emptyOnboarding.optionsLabel")}
            >
              {STARTER_OPTIONS.map((option, index) => {
                const Icon = option.icon;
                const selected = option.id === selectedId;
                return (
                  <label
                    className="empty-workspace-starter-option"
                    data-selected={selected ? "true" : undefined}
                    key={option.id}
                  >
                    <input
                      type="radio"
                      name="empty-workspace-starter"
                      value={option.id}
                      checked={selected}
                      disabled={submitting}
                      data-desktop-dialog-initial-focus={index === 0 ? "true" : undefined}
                      onChange={() => {
                        setSelectedId(option.id);
                        setError(null);
                      }}
                    />
                    <span className="empty-workspace-starter-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="empty-workspace-starter-copy">
                      <strong>{t(option.titleKey)}</strong>
                      <span>{t(option.descriptionKey)}</span>
                    </span>
                    <span className="empty-workspace-starter-check" aria-hidden="true">
                      {selected && <Check />}
                    </span>
                  </label>
                );
              })}
            </div>
            {error && <p className="desktop-dialog-error" role="alert">{error}</p>}
          </div>

          <footer className="desktop-dialog-footer empty-workspace-starter-footer">
            <button
              className="desktop-dialog-button primary"
              type="button"
              disabled={!selectedId || submitting}
              onClick={() => void confirm()}
            >
              {t(submitting
                ? "workspace.emptyOnboarding.creating"
                : "workspace.emptyOnboarding.continue")}
            </button>
          </footer>
        </DesktopDialogSurface>
      </DesktopDialogRoot>
    </DesktopOverlayLayer>
  );
}

function getLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
