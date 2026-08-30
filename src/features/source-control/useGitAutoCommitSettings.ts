import { useCallback, useEffect, useState } from "react";
import type { GitAutoCommitSnapshot } from "../../types/electron";

export function useGitAutoCommitSettings(rootPath: string, experimentalOptIn: boolean) {
  const [snapshot, setSnapshot] = useState<GitAutoCommitSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = Boolean(window.puppyoneDesktop?.getGitAutoCommitSettings);

  const refresh = useCallback(async () => {
    const getSettings = window.puppyoneDesktop?.getGitAutoCommitSettings;
    if (!getSettings) return null;
    const next = await getSettings({ rootPath });
    setSnapshot(next);
    return next;
  }, [rootPath]);

  useEffect(() => {
    let active = true;
    const getSettings = window.puppyoneDesktop?.getGitAutoCommitSettings;
    if (!getSettings) {
      setSnapshot(null);
      return;
    }
    void getSettings({ rootPath }).then((next) => {
      if (active) setSnapshot(next);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    });
    const stop = window.puppyoneDesktop?.onGitAutoCommitStateChanged?.((next) => {
      if (active) setSnapshot(next);
    });
    return () => {
      active = false;
      stop?.();
    };
  }, [experimentalOptIn, rootPath]);

  const update = useCallback(async (patch: { enabled?: boolean; minimumIntervalMs?: number }) => {
    const setPolicy = window.puppyoneDesktop?.setGitAutoCommitWorkspacePolicy;
    if (!setPolicy) return null;
    setSaving(true);
    setError(null);
    try {
      const next = await setPolicy({ rootPath, ...patch });
      setSnapshot(next);
      return next;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setSaving(false);
    }
  }, [rootPath]);

  return { available, snapshot, saving, error, refresh, update };
}
