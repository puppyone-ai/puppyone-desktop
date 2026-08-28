export const FIRST_LAUNCH_INTRO_STORAGE_KEY = "puppyone.desktop.onboardingIntro";
export const FIRST_LAUNCH_INTRO_VERSION = "1";
export const FIRST_LAUNCH_INTRO_DURATION_MS = 2_700;
export const FIRST_LAUNCH_INTRO_REDUCED_MOTION_DURATION_MS = 220;

export function shouldShowFirstLaunchIntro({
  hasProjects,
  storage,
}: {
  hasProjects: boolean;
  storage: Pick<Storage, "getItem">;
}) {
  if (hasProjects) return false;
  try {
    return storage.getItem(FIRST_LAUNCH_INTRO_STORAGE_KEY) !== FIRST_LAUNCH_INTRO_VERSION;
  } catch {
    return false;
  }
}

export function markFirstLaunchIntroComplete(storage: Pick<Storage, "setItem">) {
  try {
    storage.setItem(FIRST_LAUNCH_INTRO_STORAGE_KEY, FIRST_LAUNCH_INTRO_VERSION);
  } catch {
    // Storage can be unavailable in hardened renderer contexts. The intro is
    // decorative, so persistence failure must never block the project picker.
  }
}
