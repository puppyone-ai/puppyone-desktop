export type RelationshipRouteRect = Readonly<{
  height: number;
  left: number;
  top: number;
  width: number;
}>;

export type RelationshipRoutingInput = Readonly<{
  id: string;
  source: RelationshipRouteRect;
  sourceId: string;
  target: RelationshipRouteRect;
  targetId: string;
}>;

export type StraightRelationshipRoute = Readonly<{
  id: string;
  path: string;
}>;

/**
 * Keeps relationship rendering linear in the number of visible edges. The
 * segment begins and ends on the glyph bounds, so there is no visual gap.
 */
export function routeStraightRelationships(
  inputs: readonly RelationshipRoutingInput[],
): readonly StraightRelationshipRoute[] {
  return inputs.map((input) => {
    const sourceCenter = getRectCenter(input.source);
    const targetCenter = getRectCenter(input.target);
    const source = getRectEdgePoint(input.source, targetCenter);
    const target = getRectEdgePoint(input.target, sourceCenter);
    return {
      id: input.id,
      path: `M ${formatCoordinate(source.x)} ${formatCoordinate(source.y)} L ${formatCoordinate(target.x)} ${formatCoordinate(target.y)}`,
    };
  });
}

function getRectEdgePoint(
  rect: RelationshipRouteRect,
  destination: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  const center = getRectCenter(rect);
  const dx = destination.x - center.x;
  const dy = destination.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : rect.width / 2 / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : rect.height / 2 / Math.abs(dy),
  );
  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}

function getRectCenter(rect: RelationshipRouteRect): Readonly<{ x: number; y: number }> {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function formatCoordinate(value: number): string {
  return String(Math.round(value * 100) / 100);
}
