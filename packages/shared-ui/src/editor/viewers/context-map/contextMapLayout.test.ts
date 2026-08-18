import { describe, expect, it } from "vitest";
import type { DataNode } from "../../../core/types";
import {
  buildFolderRelationshipLayoutZones,
  buildFolderRelationshipSceneLayout,
  getExpandedFolderPreferredWidth,
  getDraggedRelationshipOffset,
  getFolderRelationshipLayoutOffset,
  getZoomedRelationshipViewport,
} from "./contextMapLayout";
import type { FolderRelationshipEdge } from "./contextMapGraph";

describe("folder relationship layout", () => {
  it("keeps folders stable, orders linked files by folder affinity, and isolates unlinked files", () => {
    const nodes = [
      node("folder-a", "folder"),
      node("folder-b", "folder"),
      node("shared.md", "file"),
      node("near-b.md", "file"),
      node("quiet.md", "file"),
    ];
    const edges = [
      edge("folder-a", "shared.md", 1),
      edge("folder-b", "shared.md", 1),
      edge("folder-b", "near-b.md", 2),
    ];
    const zones = buildFolderRelationshipLayoutZones(
      nodes,
      edges,
      new Map([
        ["folder-a", 1],
        ["folder-b", 3],
        ["shared.md", 2],
        ["near-b.md", 2],
      ]),
    );

    expect(zones.map((zone) => zone.role)).toEqual(["folders", "linked", "unlinked"]);
    expect(zones[0]?.nodes.map((entry) => entry.node.path)).toEqual(["folder-a", "folder-b"]);
    expect(zones[1]?.nodes.map((entry) => entry.node.path)).toEqual(["shared.md", "near-b.md"]);
    expect(zones[2]?.nodes.map((entry) => entry.node.path)).toEqual(["quiet.md"]);
  });

  it("places the strongest hub in the center when no folders are visible", () => {
    const nodes = [node("left.md", "file"), node("hub.md", "file"), node("right.md", "file")];
    const zones = buildFolderRelationshipLayoutZones(
      nodes,
      [],
      new Map([["left.md", 2], ["hub.md", 9], ["right.md", 1]]),
    );

    expect(zones[0]?.role).toBe("linked");
    expect(zones[0]?.nodes[1]?.node.path).toBe("hub.md");
  });

  it("produces stable offsets", () => {
    expect(getFolderRelationshipLayoutOffset(2, 5, "folders")).toBe(-6);
    expect(getFolderRelationshipLayoutOffset(0, 5, "unlinked")).toBe(0);
  });

  it("sizes expanded folders by their contents without stretching sparse groups", () => {
    expect(getExpandedFolderPreferredWidth(0)).toBe(162);
    expect(getExpandedFolderPreferredWidth(1)).toBe(162);
    expect(getExpandedFolderPreferredWidth(4)).toBe(594);
    expect(getExpandedFolderPreferredWidth(5)).toBe(738);
    expect(getExpandedFolderPreferredWidth(21)).toBe(738);
  });

  it("clamps manually dragged nodes to their visible layout boundary", () => {
    const limits = { minX: -20, maxX: 80, minY: -10, maxY: 60 };
    expect(getDraggedRelationshipOffset({ x: 10, y: 5 }, { x: 25, y: 20 }, limits)).toEqual({
      x: 35,
      y: 25,
    });
    expect(getDraggedRelationshipOffset({ x: 10, y: 5 }, { x: 500, y: -500 }, limits)).toEqual({
      x: 80,
      y: -10,
    });
    expect(getDraggedRelationshipOffset({ x: 10, y: 5 }, { x: 20, y: 20 }, {
      minX: 40,
      maxX: 20,
      minY: 40,
      maxY: 20,
    })).toEqual({ x: 10, y: 5 });
  });

  it("leaves root-canvas dragging unbounded", () => {
    expect(getDraggedRelationshipOffset(
      { x: 10, y: 5 },
      { x: 20_000, y: -15_000 },
      null,
    )).toEqual({ x: 20_010, y: -14_995 });
  });

  it("zooms around the pointer while respecting graph scale limits", () => {
    expect(getZoomedRelationshipViewport(
      { x: 0, y: 0, scale: 1 },
      { x: 100, y: 80 },
      2,
    )).toEqual({ x: -100, y: -80, scale: 2 });
    expect(getZoomedRelationshipViewport(
      { x: 10, y: 20, scale: 1 },
      { x: 0, y: 0 },
      10,
    ).scale).toBe(2.4);
  });

  it("builds a deterministic bounded macro layout and keeps root documents in a rail", () => {
    const nodes = [
      node("civil", "folder"),
      node("criminal", "folder"),
      node("procedure", "folder"),
      node("README.md", "file"),
    ];
    const childrenByFolderPath = new Map([
      ["civil", Array.from({ length: 6 }, (_, index) => node(`civil/${index}.md`, "file"))],
      ["criminal", [node("criminal/a.md", "file")]],
      ["procedure", [node("procedure/a.md", "file")]],
    ]);
    const input = {
      childrenByFolderPath,
      edges: [
        edge("civil/0.md", "criminal/a.md", 4),
        edge("civil/1.md", "procedure/a.md", 1),
      ],
      expandedFolderPaths: new Set(["civil"]),
      nodes,
      relationshipCountByNode: new Map([["README.md", 3]]),
    };

    const first = buildFolderRelationshipSceneLayout(input);
    const second = buildFolderRelationshipSceneLayout(input);

    expect(first).toEqual(second);
    expect(first.width).toBeGreaterThanOrEqual(1_120);
    expect(first.height).toBeGreaterThanOrEqual(640);
    expect([...first.positions.keys()]).toEqual(nodes.map((entry) => entry.path));
    expect(first.positions.get("README.md")?.y).toBeGreaterThan(
      Math.max(
        first.positions.get("criminal")?.y ?? 0,
        first.positions.get("procedure")?.y ?? 0,
      ),
    );
    expect(overlaps(
      first.positions.get("civil"),
      { height: 294, width: 738 },
      first.positions.get("criminal"),
      { height: 78, width: 112 },
    )).toBe(false);
    expect(overlaps(
      first.positions.get("civil"),
      { height: 294, width: 738 },
      first.positions.get("procedure"),
      { height: 78, width: 112 },
    )).toBe(false);
  });

  it("preserves pinned manual anchors when disclosure changes", () => {
    const previousPositions = new Map([
      ["civil", { x: 84, y: 92 }],
      ["criminal", { x: 620, y: 180 }],
    ]);
    const layout = buildFolderRelationshipSceneLayout({
      childrenByFolderPath: new Map([
        ["civil", [node("civil/a.md", "file"), node("civil/b.md", "file")]],
      ]),
      edges: [edge("civil/a.md", "criminal", 2)],
      expandedFolderPaths: new Set(["civil"]),
      nodes: [node("civil", "folder"), node("criminal", "folder")],
      pinnedNodePaths: new Set(["civil"]),
      previousPositions,
      relationshipCountByNode: new Map(),
    });

    expect(layout.positions.get("civil")).toEqual({ x: 84, y: 92 });
  });
});

function node(path: string, type: DataNode["type"]): DataNode {
  return { id: path, name: path, path, source: "local", type };
}

function edge(sourceId: string, targetId: string, count: number): FolderRelationshipEdge {
  return { bidirectional: false, count, sourceId, targetId };
}

function overlaps(
  left: Readonly<{ x: number; y: number }> | undefined,
  leftSize: Readonly<{ height: number; width: number }>,
  right: Readonly<{ x: number; y: number }> | undefined,
  rightSize: Readonly<{ height: number; width: number }>,
): boolean {
  if (!left || !right) return true;
  return left.x < right.x + rightSize.width
    && left.x + leftSize.width > right.x
    && left.y < right.y + rightSize.height
    && left.y + leftSize.height > right.y;
}
