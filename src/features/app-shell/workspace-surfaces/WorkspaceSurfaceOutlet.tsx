import type { ReactNode } from "react";
import type { ResolvedWorkspaceSurface } from "./workspaceSurfaceTypes";

export function WorkspaceSurfaceOutlet({
  region,
  surface,
}: {
  region: "sidebar" | "main";
  surface: ResolvedWorkspaceSurface;
}) {
  const content: ReactNode = surface.content[region];
  if (surface.id === "data" || content == null) return null;
  return (
    <div
      className={`desktop-view-surface desktop-view-surface-${region}`}
      data-view={surface.id}
      data-surface-lifecycle={surface.lifecycle[region]}
    >
      {content}
    </div>
  );
}
