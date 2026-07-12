import type { AgentEvent } from "./agent-contract";
import { invalidateProjectionIndexes, projectionIndexes } from "./agent-projection-indexes";
import { activityId, readString } from "./agent-projection-readers";
import type { AgentProjection } from "./agent-projection-types";

/** Rejects empty runtime placeholders before they become transcript rows. */
export function hasRenderableFileChange(payload: Record<string, unknown>) {
  const input = payload.input && typeof payload.input === "object" && !Array.isArray(payload.input)
    ? payload.input as Record<string, unknown>
    : {};
  const hasPath = [payload.path, input.path, input.file, input.filepath]
    .some((value) => Boolean(readString(value).trim()));
  const hasDiff = [payload.diff, payload.patch, input.diff, input.patch]
    .some((value) => Boolean(readString(value).trim()));
  const hasChange = Array.isArray(payload.changes) && payload.changes.some((change) => {
    if (!change || typeof change !== "object" || Array.isArray(change)) return false;
    const record = change as Record<string, unknown>;
    return Boolean(readString(record.path || record.file || record.filepath).trim());
  });
  return hasPath || hasDiff || hasChange;
}

/** Clears only the file-change row represented by an emptied runtime snapshot. */
export function clearProjectedFileChange(projection: AgentProjection, event: AgentEvent) {
  const id = activityId(event);
  const index = projectionIndexes(projection).activities.get(id);
  if (index === undefined || projection.activities[index]?.kind !== "file-change") return;
  projection.activities.splice(index, 1);
  projection.parts = projection.parts.filter((part) => part.id !== id);
  projection.rows = projection.rows.filter((row) => row.partId !== id);
  projection.turns = projection.turns.map((turn) => (
    turn.partIds.includes(id) ? { ...turn, partIds: turn.partIds.filter((partId) => partId !== id) } : turn
  ));
  invalidateProjectionIndexes(projection);
}
