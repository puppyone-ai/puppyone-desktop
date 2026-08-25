import { resolveRendererPublicAssetUrl } from "@puppyone/shared-ui";
import { useLocalization } from "@puppyone/localization";
import type { OnboardingHomeState } from "./types";

type OnboardingBrandLockupProps = {
  state: OnboardingHomeState;
  resolvedTheme: "light" | "dark";
};

export function OnboardingBrandLockup({ state, resolvedTheme }: OnboardingBrandLockupProps) {
  const { t } = useLocalization();
  const hasProjects = state === "projects";
  const markAsset = resolvedTheme === "light"
    ? "assets/brand/puppyone-onboarding-light.svg"
    : "logo-square.png";

  return (
    <header className="onboarding-brand-lockup">
      <img
        className="onboarding-brand-mark"
        src={resolveRendererPublicAssetUrl(markAsset)}
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
