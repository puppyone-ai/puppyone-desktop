import type { ThemeMode } from "../../preferences";

const puppyoneLogoUrl = new URL("../../../public/puppyone-logo.svg", import.meta.url).href;

type RestoringWorkspaceScreenProps = {
  themeMode: ThemeMode;
  resolvedTheme: "light" | "dark";
};

export function RestoringWorkspaceScreen({
  themeMode,
  resolvedTheme,
}: RestoringWorkspaceScreenProps) {
  return (
    <main
      className={`onboarding-shell ${resolvedTheme === "dark" ? "dark" : ""}`}
      data-theme-mode={themeMode}
    >
      <div className="onboarding-titlebar" aria-hidden="true" />
      <section className="restoring-workspace-status" aria-label="Opening last project">
        <img src={puppyoneLogoUrl} alt="" className="restoring-workspace-logo" />
        <span>Opening last project...</span>
      </section>
    </main>
  );
}
