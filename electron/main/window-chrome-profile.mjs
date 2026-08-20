export const DEFAULT_MACOS_WINDOW_BUTTON_POSITION = Object.freeze({ x: 13, y: 12 });

const MACOS_TIGER_WINDOW_BUTTON_POSITION = Object.freeze({ x: 13, y: 13 });
const DEFAULT_WINDOW_CHROME_PROFILE = Object.freeze({
  customControls: false,
  windowButtonPosition: DEFAULT_MACOS_WINDOW_BUTTON_POSITION,
});
const WINDOW_CHROME_PROFILES = new Map([
  ["default-titlebar-v1", DEFAULT_WINDOW_CHROME_PROFILE],
  [
    "macos-tiger-brushed-titlebar-v1",
    Object.freeze({
      customControls: false,
      windowButtonPosition: MACOS_TIGER_WINDOW_BUTTON_POSITION,
    }),
  ],
  [
    "windows-xp-luna-titlebar-v1",
    Object.freeze({
      customControls: true,
      windowButtonPosition: null,
    }),
  ],
]);

export function resolveWindowChromeProfile(titlebar) {
  return WINDOW_CHROME_PROFILES.get(titlebar) ?? DEFAULT_WINDOW_CHROME_PROFILE;
}

export function applyWindowChromeProfile(ownerWindow, titlebar) {
  const profile = resolveWindowChromeProfile(titlebar);
  ownerWindow.setWindowButtonVisibility?.(!profile.customControls);
  if (!profile.customControls && profile.windowButtonPosition) {
    // AppKit may recreate the native traffic-light controls after they have
    // been hidden. Reapply the reviewed position after restoring visibility.
    ownerWindow.setWindowButtonPosition?.({ ...profile.windowButtonPosition });
  }
  return profile;
}
