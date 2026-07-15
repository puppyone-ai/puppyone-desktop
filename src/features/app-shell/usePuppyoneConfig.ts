import { useCallback, useEffect, useRef, useState } from "react";
import type { PuppyoneWorkspaceConfig } from "../../types/electron";
import {
  readPuppyoneWorkspaceConfig,
  writePuppyoneWorkspaceConfig,
} from "../../lib/localFiles";

export function usePuppyoneConfig(workspacePath: string | null) {
  const [puppyoneConfig, setPuppyoneConfig] = useState<PuppyoneWorkspaceConfig | null>(null);
  const [puppyoneConfigLoading, setPuppyoneConfigLoading] = useState(false);
  const [puppyoneConfigSaving, setPuppyoneConfigSaving] = useState(false);
  const [puppyoneConfigError, setPuppyoneConfigError] = useState<string | null>(null);
  const lastKnownConfigRef = useRef<PuppyoneWorkspaceConfig | null>(null);

  useEffect(() => {
    if (!workspacePath) {
      setPuppyoneConfig(null);
      lastKnownConfigRef.current = null;
      setPuppyoneConfigError(null);
      setPuppyoneConfigLoading(false);
      return undefined;
    }

    let cancelled = false;
    // Last-known-good state is scoped to one workspace. Never carry config
    // preferences across a direct workspace-to-workspace switch.
    lastKnownConfigRef.current = null;
    setPuppyoneConfig(null);
    setPuppyoneConfigLoading(true);
    setPuppyoneConfigError(null);

    let reloadTimer: number | null = null;
    const loadConfig = async () => {
      try {
        const config = await readPuppyoneWorkspaceConfig(workspacePath);
        if (cancelled) return;
        lastKnownConfigRef.current = config;
        setPuppyoneConfig(config);
        setPuppyoneConfigError(null);
      } catch (error) {
        if (cancelled) return;
        // Keep the last verified config on a half-write, invalid JSON, or
        // symlink swap and surface an explicit recoverable error.
        setPuppyoneConfigError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setPuppyoneConfigLoading(false);
      }
    };

    void loadConfig();
    const contentWatch = window.puppyoneDesktop?.watchWorkspace?.(workspacePath, (event) => {
      if (cancelled || !isPuppyoneConfigEvent(event.path)) return;
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        void loadConfig();
      }, 150);
    });
    void contentWatch?.ready.catch(() => undefined);

    return () => {
      cancelled = true;
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      contentWatch?.stop();
    };
  }, [workspacePath]);

  const handlePuppyoneConfigChange = useCallback(async (nextConfig: PuppyoneWorkspaceConfig) => {
    if (!workspacePath) return null;

    setPuppyoneConfigSaving(true);
    setPuppyoneConfigError(null);
    try {
      const savedConfig = await writePuppyoneWorkspaceConfig(workspacePath, nextConfig);
      lastKnownConfigRef.current = savedConfig;
      setPuppyoneConfig(savedConfig);
      return savedConfig;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPuppyoneConfigError(message);
      throw error;
    } finally {
      setPuppyoneConfigSaving(false);
    }
  }, [workspacePath]);

  return {
    puppyoneConfig,
    puppyoneConfigError,
    puppyoneConfigLoading,
    puppyoneConfigSaving,
    handlePuppyoneConfigChange,
  };
}

export function isPuppyoneConfigEvent(eventPath: string | null): boolean {
  if (eventPath == null) return true;
  const normalized = eventPath.replaceAll("\\", "/").replace(/^\.\//, "");
  return normalized === ".puppyone"
    || normalized === ".puppyone/config.json"
    || normalized.startsWith(".puppyone/.config.");
}
