import { resolveRendererPublicAssetUrl } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import type { OnboardingHomeState } from "./types";

export function OnboardingBrandLockup({ state }: { state: OnboardingHomeState }) {
  const { t } = useLocalization();
  const hasProjects = state === "projects";

  return (
    <header className="onboarding-brand-lockup">
      <img
        className="onboarding-brand-mark"
        src={resolveRendererPublicAssetUrl("logo-square.png")}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <div className="onboarding-brand-copy">
        <span className={hasProjects ? "onboarding-brand-prompt" : "onboarding-brand-name"}>
          {t(hasProjects ? "onboarding.section.chooseProject" : "onboarding.brand.name")}
        </span>
        <p className="onboarding-brand-description">{t("onboarding.brand.description")}</p>
      </div>
    </header>
  );
}
