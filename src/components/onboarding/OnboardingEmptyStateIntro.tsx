import {
  useCallback,
  useEffect,
  useRef,
  type AnimationEvent,
} from "react";
import {
  EMPTY_STATE_INTRO_FALLBACK_TIMEOUT_MS,
  EMPTY_STATE_INTRO_REDUCED_MOTION_DURATION_MS,
} from "./emptyStateIntro";

type OnboardingEmptyStateIntroProps = {
  onComplete: () => void;
};

export function OnboardingEmptyStateIntro({ onComplete }: OnboardingEmptyStateIntroProps) {
  const completedRef = useRef(false);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const duration = reducedMotion
      ? EMPTY_STATE_INTRO_REDUCED_MOTION_DURATION_MS
      : EMPTY_STATE_INTRO_FALLBACK_TIMEOUT_MS;
    const fallback = window.setTimeout(complete, duration);
    return () => window.clearTimeout(fallback);
  }, [complete]);

  const finishAnimation = useCallback((event: AnimationEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return;
    complete();
  }, [complete]);

  return (
    <div
      className="onboarding-empty-state-intro"
      data-onboarding-empty-state-intro=""
      aria-hidden="true"
      onAnimationEnd={finishAnimation}
    >
      <span className="onboarding-empty-state-reveal" />
    </div>
  );
}
