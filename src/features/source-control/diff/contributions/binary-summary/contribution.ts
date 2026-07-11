import { BinarySummaryDiff } from "./BinarySummaryDiff";
import type { DiffViewerContribution } from "../../core/types";

export const binarySummaryContribution: DiffViewerContribution = Object.freeze({
  id: "binary-summary",
  version: "1",
  kind: "sync",
  source: "metadata",
  match: () => true,
  render: BinarySummaryDiff,
});
