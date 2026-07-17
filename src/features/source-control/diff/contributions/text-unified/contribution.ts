import { isTextLikeFileFormat } from "@puppyone/shared-ui";
import { TextUnifiedDiff } from "./TextUnifiedDiff";
import type { DiffViewerContribution } from "../../core/types";

export const textUnifiedContribution: DiffViewerContribution = Object.freeze({
  id: "text-unified",
  version: "1",
  kind: "sync",
  source: "git-patch",
  match: ({ file, format }) => (
    file.binary !== true && (isTextLikeFileFormat(format) || file.lines.length > 0)
  ),
  render: TextUnifiedDiff,
});
