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
  const renderer = lazy(viewer.load);
  lazyRenderers.set(viewer, renderer);
  return renderer;
}
