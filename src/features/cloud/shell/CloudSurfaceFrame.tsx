import type { ReactNode } from "react";
import type { CloudRouteSurface } from "../routes/cloudRoutes";

export function CloudSurfaceFrame({
  surface,
  children,
}: {
  surface: CloudRouteSurface;
  children: ReactNode;
}) {
  const mainClassName = [
    "desktop-cloud-main-view",
    surface === "history" ? "desktop-cloud-history-main-view" : null,
    surface === "landing" ? "desktop-cloud-landing-main-view" : null,
    surface === "automation" ? "desktop-cloud-automation-main-view" : null,
  ].filter(Boolean).join(" ");
  const shellClassName = [
    "desktop-cloud-page-shell",
    surface === "history" ? "desktop-cloud-history-page-shell" : null,
    surface === "landing" ? "desktop-cloud-landing-page-shell" : null,
    surface === "automation" ? "desktop-cloud-automation-page-shell" : null,
  ].filter(Boolean).join(" ");

  return (
    <main className={mainClassName} data-cloud-surface={surface}>
      <div className={shellClassName}>{children}</div>
    </main>
  );
}
