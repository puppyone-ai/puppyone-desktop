import { useMemo, useState } from "react";
import {
  Box,
  Check,
  FileArchive,
  FileText,
  Film,
  Image,
  PackagePlus,
  Presentation,
  ShieldCheck,
  Table2,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { ViewerContribution, ViewerPackSnapshot } from "@puppyone/shared-ui";
import {
  OFFICIAL_VIEWER_CATALOG,
  type OfficialViewerCatalogEntry,
  type OfficialViewerIcon,
} from "./pluginCatalog";
import type { PluginsSection } from "./PluginsSidebar";

type PluginBridge = NonNullable<NonNullable<typeof window.puppyoneDesktop>["viewerPacks"]>;

export function PluginsView({
  activeSection,
  hostAvailable,
  snapshot,
  onRefresh,
}: {
  activeSection: PluginsSection;
  hostAvailable: boolean;
  snapshot: ViewerPackSnapshot;
  onRefresh: () => void | Promise<void>;
}) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const installed = useMemo(
    () => [...snapshot.contributions].sort((a, b) => a.label.localeCompare(b.label)),
    [snapshot.contributions],
  );

  const installLocal = async () => {
    const bridge = getPluginBridge();
    if (!bridge) return;
    setBusyAction("install");
    setFeedback(null);
    try {
      const result = await bridge.installLocal();
      if (result.canceled) return;
      await onRefresh();
      setFeedback({
        tone: "success",
        message: `${result.pluginId} ${result.version} is installed and ready for matching local files.`,
      });
    } catch (error) {
      setFeedback({
        tone: "danger",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const uninstall = async (plugin: ViewerContribution) => {
    const bridge = getPluginBridge();
    if (!bridge) return;
    setBusyAction(`remove:${plugin.pluginId}`);
    setFeedback(null);
    try {
      const result = await bridge.uninstall({ pluginId: plugin.pluginId });
      if (!result.ok && !result.canceled) throw new Error("Plugin could not be removed.");
      if (result.canceled) return;
      await onRefresh();
      setFeedback({ tone: "success", message: `${plugin.label} was removed from this device.` });
    } catch (error) {
      setFeedback({
        tone: "danger",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="desktop-plugins-view">
      <div className="desktop-plugins-scroll">
        <div className="desktop-plugins-page">
          <header className="desktop-plugins-header">
            <div>
              <span className="desktop-plugins-kicker">Experimental · Local only</span>
              <h1>Plugins</h1>
              <p>Add focused viewers without turning the editor into a heavyweight application.</p>
            </div>
            <button
              className="desktop-plugins-install-action"
              type="button"
              disabled={!hostAvailable || busyAction !== null}
              title={hostAvailable ? "Install a signed local Viewer Pack" : "Local Viewer Pack installation is unavailable in this build"}
              onClick={() => void installLocal()}
            >
              <PackagePlus size={15} aria-hidden="true" />
              <span>{busyAction === "install" ? "Installing…" : "Install from file"}</span>
            </button>
          </header>

          {feedback && (
            <div className={`desktop-plugins-feedback ${feedback.tone}`} role={feedback.tone === "danger" ? "alert" : "status"}>
              {feedback.message}
            </div>
          )}

          {activeSection === "discover" && (
            <>
              <PluginPrinciples />
              <OfficialViewersSection entries={OFFICIAL_VIEWER_CATALOG.slice(0, 3)} compact />
              <InstalledPluginsSection
                hostAvailable={hostAvailable}
                installed={installed}
                busyAction={busyAction}
                onInstall={installLocal}
                onUninstall={uninstall}
                previewLimit={2}
              />
            </>
          )}

          {activeSection === "built-in" && (
            <OfficialViewersSection entries={OFFICIAL_VIEWER_CATALOG} />
          )}

          {activeSection === "installed" && (
            <InstalledPluginsSection
              hostAvailable={hostAvailable}
              installed={installed}
              busyAction={busyAction}
              onInstall={installLocal}
              onUninstall={uninstall}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function PluginPrinciples() {
  return (
    <div className="desktop-plugins-principles" aria-label="Plugin safety model">
      <span><ShieldCheck size={15} aria-hidden="true" /> Sandboxed</span>
      <span><FileArchive size={15} aria-hidden="true" /> Current file only</span>
      <span><Check size={15} aria-hidden="true" /> Signed packages</span>
    </div>
  );
}

function OfficialViewersSection({
  entries,
  compact = false,
}: {
  entries: readonly OfficialViewerCatalogEntry[];
  compact?: boolean;
}) {
  return (
    <section className="desktop-plugins-section">
      <div className="desktop-plugins-section-heading">
        <div>
          <h2>Official viewers</h2>
          <p>Included with PuppyOne and activated only when a matching file is opened.</p>
        </div>
        <span>{compact ? "Featured" : `${entries.length} included`}</span>
      </div>
      <div className="desktop-plugins-grid">
        {entries.map((entry) => (
          <OfficialViewerCard key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function OfficialViewerCard({ entry }: { entry: OfficialViewerCatalogEntry }) {
  const Icon = OFFICIAL_VIEWER_ICONS[entry.icon];
  return (
    <article className="desktop-plugin-card">
      <div className="desktop-plugin-card-topline">
        <span className="desktop-plugin-mark"><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="desktop-plugin-status included"><Check size={11} aria-hidden="true" /> Included</span>
      </div>
      <div className="desktop-plugin-card-copy">
        <h3>{entry.title}</h3>
        <p>{entry.description}</p>
      </div>
      <div className="desktop-plugin-formats" aria-label={`${entry.title} formats`}>
        {entry.formats.map((format) => <span key={format}>{format}</span>)}
      </div>
    </article>
  );
}

function InstalledPluginsSection({
  hostAvailable,
  installed,
  busyAction,
  onInstall,
  onUninstall,
  previewLimit,
}: {
  hostAvailable: boolean;
  installed: readonly ViewerContribution[];
  busyAction: string | null;
  onInstall: () => Promise<void>;
  onUninstall: (plugin: ViewerContribution) => Promise<void>;
  previewLimit?: number;
}) {
  const visible = typeof previewLimit === "number" ? installed.slice(0, previewLimit) : installed;
  return (
    <section className="desktop-plugins-section">
      <div className="desktop-plugins-section-heading">
        <div>
          <h2>Installed locally</h2>
          <p>Optional Viewer Packs stay on this device and receive no network permission.</p>
        </div>
        <span>{installed.length}</span>
      </div>
      {visible.length > 0 ? (
        <div className="desktop-installed-plugins-list">
          {visible.map((plugin) => (
            <InstalledPluginRow
              key={`${plugin.pluginId}:${plugin.contentHash}`}
              plugin={plugin}
              busy={busyAction === `remove:${plugin.pluginId}`}
              onUninstall={onUninstall}
            />
          ))}
        </div>
      ) : (
        <div className="desktop-plugins-empty">
          <span className="desktop-plugin-mark"><Box size={17} strokeWidth={1.8} aria-hidden="true" /></span>
          <div>
            <strong>No optional plugins installed</strong>
            <p>
              {hostAvailable
                ? "Install a signed Viewer Pack for a local format that does not already have a built-in preview."
                : "Signed local Viewer Packs will appear here when installation is available."}
            </p>
          </div>
          <button type="button" disabled={!hostAvailable || busyAction !== null} onClick={() => void onInstall()}>
            Install from file
          </button>
        </div>
      )}
    </section>
  );
}

function InstalledPluginRow({
  plugin,
  busy,
  onUninstall,
}: {
  plugin: ViewerContribution;
  busy: boolean;
  onUninstall: (plugin: ViewerContribution) => Promise<void>;
}) {
  const formats = plugin.formats.flatMap((format) => format.extensions).slice(0, 6);
  return (
    <article className="desktop-installed-plugin-row">
      <span className="desktop-plugin-mark"><Box size={17} strokeWidth={1.8} aria-hidden="true" /></span>
      <div className="desktop-installed-plugin-copy">
        <div>
          <h3>{plugin.label}</h3>
          <span>{plugin.version}</span>
        </div>
        <p>{plugin.publisher} · Current file access only</p>
        {formats.length > 0 && (
          <div className="desktop-plugin-formats">
            {formats.map((format) => <span key={format}>{format.replace(/^\./, "").toUpperCase()}</span>)}
          </div>
        )}
      </div>
      <button
        className="desktop-plugin-remove-action"
        type="button"
        disabled={busy}
        onClick={() => void onUninstall(plugin)}
      >
        <Trash2 size={13} aria-hidden="true" />
        <span>{busy ? "Removing…" : "Remove"}</span>
      </button>
    </article>
  );
}

function getPluginBridge(): PluginBridge | null {
  return typeof window !== "undefined" ? window.puppyoneDesktop?.viewerPacks ?? null : null;
}

const OFFICIAL_VIEWER_ICONS: Record<OfficialViewerIcon, LucideIcon> = {
  document: FileText,
  spreadsheet: Table2,
  presentation: Presentation,
  pdf: FileArchive,
  image: Image,
  media: Film,
};
