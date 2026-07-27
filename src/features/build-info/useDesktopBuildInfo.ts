import { useEffect, useState } from "react";
import type { DesktopBuildInfo } from "../../types/electron";

let buildInfoPromise: Promise<DesktopBuildInfo | null> | null = null;

export function readDesktopBuildInfo(): Promise<DesktopBuildInfo | null> {
  if (buildInfoPromise) return buildInfoPromise;
  const bridge = window.puppyoneDesktop;
  buildInfoPromise = bridge?.getBuildInfo
    ? bridge.getBuildInfo().catch((error) => {
        console.warn("Unable to read PuppyOne Desktop Build Identity:", error);
        return null;
      })
    : Promise.resolve(null);
  return buildInfoPromise;
}

export function useDesktopBuildInfo(): DesktopBuildInfo | null {
  const [buildInfo, setBuildInfo] = useState<DesktopBuildInfo | null>(null);

  useEffect(() => {
    let active = true;
    void readDesktopBuildInfo().then((value) => {
      if (active) setBuildInfo(value);
    });
    return () => {
      active = false;
    };
  }, []);

  return buildInfo;
}

export function resetDesktopBuildInfoCacheForTests() {
  buildInfoPromise = null;
}
