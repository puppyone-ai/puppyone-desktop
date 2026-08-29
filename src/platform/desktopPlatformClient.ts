import type { DesktopPlatformCapabilities } from "../types/electron";

let capabilityPromise: Promise<DesktopPlatformCapabilities | null> | null = null;

export function readDesktopPlatformCapabilities(): Promise<DesktopPlatformCapabilities | null> {
  if (capabilityPromise) return capabilityPromise;
  const bridge = window.puppyoneDesktop;
  capabilityPromise = bridge?.getPlatformCapabilities
    ? bridge.getPlatformCapabilities().catch((error) => {
        console.warn("Unable to read PuppyOne Desktop platform capabilities:", error);
        return null;
      })
    : Promise.resolve(null);
  return capabilityPromise;
}

export function resetDesktopPlatformCapabilitiesForTests() {
  capabilityPromise = null;
}
