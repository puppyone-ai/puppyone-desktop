"use client";

import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import type {
  LazyPresetViewerContribution,
  PresetViewerContribution,
  PresetViewerRenderContext,
} from "./viewerTypes";

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
  if ("render" in viewer && typeof viewer.render === "function") {
    return <>{viewer.render(context)}</>;
  }

  const LazyRenderer = getLazyRenderer(viewer as LazyPresetViewerContribution);
  return (
    <Suspense fallback={<div className="editor-state">Loading viewer…</div>}>
      <LazyRenderer {...context} />
    </Suspense>
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
