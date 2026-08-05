import type { AppPreviewResult, AppPreviewSurfaceState } from "../../../core/types";

export type AppPreviewMode = "preview" | "source" | "logs";

export type AppPreviewViewState = {
  status: "idle" | "starting" | "running" | "stopped" | "error";
  runtime: AppPreviewResult | null;
  surface: AppPreviewSurfaceState | null;
  error: { code: "unavailable" | "start-failed"; detail: string | null } | null;
};
