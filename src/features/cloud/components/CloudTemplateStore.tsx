import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, File, Folder, RefreshCw, Search } from "lucide-react";
import type { MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import {
  getCloudTemplate,
  instantiateCloudTemplate,
  listCloudTemplates,
  type DesktopCloudProject,
  type DesktopCloudSession,
  type DesktopCloudTemplateCatalog,
  type DesktopCloudTemplateDetail,
  type DesktopCloudTemplateSummary,
  type MutableSessionHandler,
} from "../../../lib/cloudApi";

const TEMPLATE_PAGE_SIZE = 24;
const TEMPLATE_SEARCH_DELAY_MS = 250;

export function CloudTemplateStore({
  session,
  apiBaseUrl,
  onSessionChange,
  onProjectCreated,
}: {
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  onSessionChange: MutableSessionHandler;
  onProjectCreated: (project: DesktopCloudProject) => void | Promise<void>;
}) {
  const { t } = useLocalization();
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [catalog, setCatalog] = useState<DesktopCloudTemplateCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const creationInFlight = useRef(false);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setSearchQuery(query.trim()),
      TEMPLATE_SEARCH_DELAY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [query]);

  const loadCatalog = useCallback(async ({
    cursor,
    append,
  }: { cursor?: string; append?: boolean } = {}) => {
    const sequence = ++requestSequence.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const page = await listCloudTemplates(
        session,
        {
          query: searchQuery || undefined,
          cursor,
          limit: TEMPLATE_PAGE_SIZE,
        },
        onSessionChange,
        apiBaseUrl,
      );
      if (sequence !== requestSequence.current) return;
      setCatalog((current) => append && current
        ? {
            ...page,
            templates: mergeTemplates(current.templates, page.templates),
          }
        : page);
    } catch (loadError) {
      if (sequence !== requestSequence.current) return;
      setError(loadError instanceof Error ? loadError.message : t("cloud.template.loadFailed"));
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [apiBaseUrl, onSessionChange, searchQuery, session, t]);

  useEffect(() => {
    setSelectedTemplateId(null);
    void loadCatalog();
    return () => {
      requestSequence.current += 1;
    };
  }, [loadCatalog]);

  const createProject = async (template: DesktopCloudTemplateSummary) => {
    if (creationInFlight.current) return;
    creationInFlight.current = true;
    setCreatingTemplateId(template.id);
    setError(null);
    try {
      const result = await instantiateCloudTemplate(
        session,
        template.id,
        { release_id: template.current_release.id },
        onSessionChange,
        apiBaseUrl,
      );
      await onProjectCreated(result.project);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("cloud.template.createFailed"));
    } finally {
      creationInFlight.current = false;
      setCreatingTemplateId(null);
    }
  };

  if (selectedTemplateId) {
    const summary = catalog?.templates.find((item) => item.id === selectedTemplateId) ?? null;
    return (
      <CloudTemplateDetail
        session={session}
        apiBaseUrl={apiBaseUrl}
        templateId={selectedTemplateId}
        summary={summary}
        creating={creatingTemplateId === selectedTemplateId}
        disabled={!catalog?.registry.instantiation_enabled}
        actionError={error}
        onSessionChange={onSessionChange}
        onBack={() => setSelectedTemplateId(null)}
        onUse={(template) => void createProject(template)}
      />
    );
  }

  return (
    <section className="desktop-cloud-template-store" aria-label={t("cloud.template.ariaLabel")}>
      <header className="desktop-cloud-template-header">
        <div>
          <h1>{t("cloud.route.templates.title")}</h1>
          <p>{t("cloud.route.templates.description")}</p>
        </div>
        {catalog?.registry.source && catalog.registry.source !== "disabled" && (
          <span className="desktop-cloud-template-source">
            {t(catalog.registry.source === "remote"
              ? "cloud.template.sourceRemote"
              : "cloud.template.sourceBuiltin")}
          </span>
        )}
      </header>

      <div className="desktop-cloud-template-toolbar">
        <label className="desktop-cloud-template-search">
          <Search size={15} />
          <span className="desktop-visually-hidden">{t("cloud.template.search")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("cloud.template.searchPlaceholder")}
          />
        </label>
        <button
          className="desktop-cloud-template-refresh"
          type="button"
          disabled={loading}
          onClick={() => void loadCatalog()}
          title={t("cloud.common.refresh")}
          aria-label={t("cloud.common.refresh")}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {error && <div className="desktop-cloud-template-alert" role="alert">{error}</div>}
      {catalog?.registry.catalog_enabled && !catalog.registry.instantiation_enabled && (
        <div className="desktop-cloud-template-notice">
          {t("cloud.template.readOnlyDescription")}
        </div>
      )}

      {loading && !catalog ? (
        <TemplateGridSkeleton />
      ) : catalog?.registry.catalog_enabled === false ? (
        <TemplateEmptyState
          title={t("cloud.template.disabledTitle")}
          description={t("cloud.template.disabledDescription")}
        />
      ) : !catalog?.templates.length ? (
        <TemplateEmptyState
          title={t("cloud.template.emptyTitle")}
          description={t("cloud.template.emptyDescription")}
        />
      ) : (
        <>
          <div className="desktop-cloud-template-grid" aria-busy={loading || undefined}>
            {catalog.templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                creating={creatingTemplateId === template.id}
                disabled={Boolean(creatingTemplateId) || !catalog.registry.instantiation_enabled}
                onOpen={() => setSelectedTemplateId(template.id)}
                onUse={() => void createProject(template)}
              />
            ))}
          </div>
          {catalog.next_cursor && (
            <div className="desktop-cloud-template-pagination">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadCatalog({
                  cursor: catalog.next_cursor ?? undefined,
                  append: true,
                })}
              >
                {t(loadingMore ? "cloud.common.loading" : "cloud.common.loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TemplateCard({
  template,
  creating,
  disabled,
  onOpen,
  onUse,
}: {
  template: DesktopCloudTemplateSummary;
  creating: boolean;
  disabled: boolean;
  onOpen: () => void;
  onUse: () => void;
}) {
  const { t } = useLocalization();
  return (
    <article className="desktop-cloud-template-card" data-template-id={template.id}>
      <button className="desktop-cloud-template-card-open" type="button" onClick={onOpen}>
        <span className="desktop-cloud-template-card-visual" aria-hidden>{template.icon}</span>
        <span className="desktop-cloud-template-card-body">
          <span className="desktop-cloud-template-card-heading">
            <strong>{template.name}</strong>
            <code>{template.current_release.version}</code>
          </span>
          {(template.author || template.category) && (
            <span className="desktop-cloud-template-card-meta">
              {template.author
                ? t("cloud.template.byAuthor", { author: template.author })
                : template.category}
            </span>
          )}
          <span className="desktop-cloud-template-card-description">{template.description}</span>
          {template.preview.length > 0 && (
            <span className="desktop-cloud-template-card-preview">
              {template.preview.slice(0, 4).map((item) => (
                <span key={item.name}>{item.name}</span>
              ))}
            </span>
          )}
        </span>
      </button>
      <div className="desktop-cloud-template-card-footer">
        <span>{t("cloud.template.fileCount", { count: template.current_release.file_count })}</span>
        <button type="button" disabled={disabled} onClick={onUse}>
          {t(creating ? "cloud.template.creating" : "cloud.template.use")}
        </button>
      </div>
    </article>
  );
}

function CloudTemplateDetail({
  session,
  apiBaseUrl,
  templateId,
  summary,
  creating,
  disabled,
  actionError,
  onSessionChange,
  onBack,
  onUse,
}: {
  session: DesktopCloudSession;
  apiBaseUrl: string | null;
  templateId: string;
  summary: DesktopCloudTemplateSummary | null;
  creating: boolean;
  disabled: boolean;
  actionError: string | null;
  onSessionChange: MutableSessionHandler;
  onBack: () => void;
  onUse: (template: DesktopCloudTemplateSummary) => void;
}) {
  const { t } = useLocalization();
  const [detail, setDetail] = useState<DesktopCloudTemplateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setDetail(null);
    setError(null);
    getCloudTemplate(session, templateId, onSessionChange, apiBaseUrl)
      .then((value) => {
        if (current) setDetail(value);
      })
      .catch((detailError) => {
        if (current) {
          setError(detailError instanceof Error
            ? detailError.message
            : t("cloud.template.detailLoadFailed"));
        }
      });
    return () => {
      current = false;
    };
  }, [apiBaseUrl, onSessionChange, session, t, templateId]);

  const template = detail ?? summary;
  return (
    <section className="desktop-cloud-template-detail" aria-label={t("cloud.template.detailAriaLabel")}>
      <button className="desktop-cloud-template-back" type="button" onClick={onBack}>
        <ArrowLeft className="po-directional-icon" size={14} />
        <span>{t("cloud.template.back")}</span>
      </button>
      {actionError && <div className="desktop-cloud-template-alert" role="alert">{actionError}</div>}
      {error && <div className="desktop-cloud-template-alert" role="alert">{error}</div>}
      {!template ? (
        <TemplateDetailSkeleton />
      ) : (
        <>
          <header className="desktop-cloud-template-detail-header">
            <span className="desktop-cloud-template-detail-icon" aria-hidden>{template.icon}</span>
            <div>
              <h1>{template.name}</h1>
              <p>{template.description}</p>
              <div className="desktop-cloud-template-detail-meta">
                {template.author && <span>{t("cloud.template.byAuthor", { author: template.author })}</span>}
                <span>{template.current_release.version}</span>
                <span>{formatTemplateSize(template.current_release.total_bytes, t)}</span>
              </div>
            </div>
            <button
              className="desktop-cloud-template-primary-action"
              type="button"
              disabled={creating || disabled}
              onClick={() => onUse(template)}
            >
              {t(creating ? "cloud.template.creating" : "cloud.template.use")}
            </button>
          </header>

          {detail && (
            <div className="desktop-cloud-template-detail-grid">
              <div className="desktop-cloud-template-detail-copy">
                <h2>{t("cloud.template.about")}</h2>
                <p>{detail.long_description || detail.description}</p>
                {detail.preview_document && (
                  <section>
                    <h2>{detail.preview_document.path}</h2>
                    <pre>{detail.preview_document.content}</pre>
                  </section>
                )}
              </div>
              <aside className="desktop-cloud-template-file-list">
                <h2>{t("cloud.template.includedFiles")}</h2>
                <ul>
                  {detail.file_tree.map((path) => (
                    <li key={path}>
                      {path.endsWith("/") ? <Folder size={12} /> : <File size={12} />}
                      <span>{path}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TemplateEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="desktop-cloud-template-empty">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function TemplateGridSkeleton() {
  return (
    <div className="desktop-cloud-template-grid" aria-busy="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="desktop-cloud-template-card desktop-cloud-template-skeleton" key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function TemplateDetailSkeleton() {
  return (
    <div className="desktop-cloud-template-detail-skeleton" aria-busy="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function mergeTemplates(
  current: DesktopCloudTemplateSummary[],
  next: DesktopCloudTemplateSummary[],
): DesktopCloudTemplateSummary[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of next) merged.set(item.id, item);
  return [...merged.values()];
}

function formatTemplateSize(bytes: number, t: MessageFormatter): string {
  if (bytes < 1024) return t("cloud.size.bytes", { value: bytes });
  if (bytes < 1024 * 1024) {
    return t("cloud.size.kilobytes", { value: (bytes / 1024).toFixed(1) });
  }
  return t("cloud.size.megabytes", { value: (bytes / (1024 * 1024)).toFixed(1) });
}
