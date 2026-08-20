"use client";

import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { useLocalization } from "@puppyone/localization/react";
import { DocumentSurfacePending } from "./DocumentSurfaceHost";
import type {
  LazyPresetViewerContribution,
  PresetViewerContribution,
  PresetViewerRenderContext,
} from "../registry/viewerTypes";
import type { ViewerSurfaceFamily, ViewerSurfaceTrait } from "../registry/viewerContract";

const lazyRenderers = new WeakMap<
  LazyPresetViewerContribution,
  LazyExoticComponent<ComponentType<PresetViewerRenderContext>>
>();
const rendererModulePromises = new WeakMap<
  LazyPresetViewerContribution,
  ReturnType<LazyPresetViewerContribution["load"]>
>();

/** Starts a lazy viewer download without mounting it. Module evaluation stays
 * deduplicated and the same promise is later consumed by React.lazy. */
export function preloadPresetViewer(viewer: PresetViewerContribution): Promise<void> {
  if ("render" in viewer && typeof viewer.render === "function") return Promise.resolve();
  return loadRendererModule(viewer as LazyPresetViewerContribution).then(() => undefined);
}

export function PresetViewerRenderer({
  viewer,
  context,
}: {
  viewer: PresetViewerContribution;
  context: PresetViewerRenderContext;
}) {
  const { t } = useLocalization();
  if ("render" in viewer && typeof viewer.render === "function") {
    return (
      <ViewerSurfaceBoundary
        viewerId={viewer.id}
        family={viewer.surfaceFamily}
        traits={viewer.surfaceTraits}
      >
        {viewer.render(context)}
      </ViewerSurfaceBoundary>
    );
  }

  const LazyRenderer = getLazyRenderer(viewer as LazyPresetViewerContribution);
  return (
    <ViewerSurfaceBoundary
      viewerId={viewer.id}
      family={viewer.surfaceFamily}
      traits={viewer.surfaceTraits}
    >
      <Suspense fallback={<DocumentSurfacePending label={t("editor.loadingViewer")} />}>
        <LazyRenderer {...context} />
      </Suspense>
    </ViewerSurfaceBoundary>
  );
}

export function ViewerSurfaceBoundary({
  viewerId,
  family,
  traits,
  children,
}: {
  viewerId: string;
  family: ViewerSurfaceFamily;
  traits: readonly ViewerSurfaceTrait[];
  children: ReactNode;
}) {
  return (
    <div
      className="po-viewer-surface-boundary"
      data-viewer-id={viewerId}
      data-viewer-surface-family={family}
      data-viewer-surface-traits={traits.join(" ") || undefined}
    >
      {children}
    </div>
  );
}

function getLazyRenderer(viewer: LazyPresetViewerContribution) {
  const cached = lazyRenderers.get(viewer);
  if (cached) return cached;
  const renderer = lazy(() => loadRendererModule(viewer));
  lazyRenderers.set(viewer, renderer);
  return renderer;
}

function loadRendererModule(viewer: LazyPresetViewerContribution) {
  const cached = rendererModulePromises.get(viewer);
  if (cached) return cached;
  const modulePromise = viewer.load();
  rendererModulePromises.set(viewer, modulePromise);
  void modulePromise.catch(() => {
    if (rendererModulePromises.get(viewer) === modulePromise) {
      rendererModulePromises.delete(viewer);
    }
  });
  return modulePromise;
}
