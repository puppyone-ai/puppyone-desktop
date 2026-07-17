import type { AgentProjection } from "./agent-projection-types";

const PROJECTION_INDEXES = Symbol("agentProjectionIndexes");

export type ProjectionIndexes = {
  messages: Map<string, number>;
  messagesByTurn: Map<string, number[]>;
  activities: Map<string, number>;
  turns: Map<string, number>;
  parts: Map<string, number>;
  rows: Map<string, number>;
};

/** Lazily rebuilds non-serializable indexes on replayed or cloned projections. */
export function projectionIndexes(projection: AgentProjection): ProjectionIndexes {
  const holder = projection as AgentProjection & { [PROJECTION_INDEXES]?: ProjectionIndexes };
  if (holder[PROJECTION_INDEXES]) return holder[PROJECTION_INDEXES];
  const messagesByTurn = new Map<string, number[]>();
  projection.messages.forEach((message, index) => {
    if (message.turnId) messagesByTurn.set(message.turnId, [...(messagesByTurn.get(message.turnId) ?? []), index]);
  });
  const indexes: ProjectionIndexes = {
    messages: new Map(projection.messages.map((message, index) => [message.id, index])),
    messagesByTurn,
    activities: new Map(projection.activities.map((activity, index) => [activity.id, index])),
    turns: new Map(projection.turns.map((turn, index) => [turn.id, index])),
    parts: new Map(projection.parts.map((part, index) => [part.id, index])),
    rows: new Map(projection.rows.map((row, index) => [row.id, index])),
  };
  Object.defineProperty(holder, PROJECTION_INDEXES, { value: indexes, configurable: true });
  return indexes;
}

export function invalidateProjectionIndexes(projection: AgentProjection) {
  const holder = projection as AgentProjection & { [PROJECTION_INDEXES]?: ProjectionIndexes };
  Reflect.deleteProperty(holder, PROJECTION_INDEXES);
}

export function cloneAgentProjection(value: AgentProjection): AgentProjection {
  return {
    ...value,
    missingRanges: [...value.missingRanges],
    messages: [...value.messages],
    activities: [...value.activities],
    approvals: [...value.approvals],
    questions: [...value.questions],
    turns: [...value.turns],
    parts: [...value.parts],
    rows: [...value.rows],
  };
}
