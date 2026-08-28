import { useCallback, useEffect, useRef, type AnimationEvent } from "react";
import {
  FIRST_LAUNCH_INTRO_DURATION_MS,
  FIRST_LAUNCH_INTRO_REDUCED_MOTION_DURATION_MS,
} from "./firstLaunchIntro";

type OnboardingFirstLaunchIntroProps = {
  onComplete: () => void;
};

export function OnboardingFirstLaunchIntro({ onComplete }: OnboardingFirstLaunchIntroProps) {
  const completedRef = useRef(false);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const duration = reducedMotion
      ? FIRST_LAUNCH_INTRO_REDUCED_MOTION_DURATION_MS
      : FIRST_LAUNCH_INTRO_DURATION_MS;
    const fallback = window.setTimeout(complete, duration + 80);
    return () => window.clearTimeout(fallback);
  }, [complete]);

  const finishAnimation = useCallback((event: AnimationEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return;
    complete();
  }, [complete]);

  return (
    <div
      className="onboarding-first-launch-intro"
      data-onboarding-first-launch-intro=""
      aria-hidden="true"
      onAnimationEnd={finishAnimation}
    >
      <span className="onboarding-first-launch-reveal" />
    </div>
  );
}
