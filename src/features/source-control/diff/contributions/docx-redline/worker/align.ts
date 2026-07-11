import { DOCX_REDLINE_BUDGET } from "../budget";
import type {
  DocxNormalizedBlock,
  DocxRedlineChange,
  DocxRedlineSegment,
} from "../model";

export function alignDocxBlocks(
  before: readonly DocxNormalizedBlock[],
  after: readonly DocxNormalizedBlock[],
): DocxRedlineChange[] {
  if (before.length === 0) return after.map((block, index) => addedChange(block, index));
  if (after.length === 0) return before.map((block, index) => deletedChange(block, index));

  const anchors = findUniqueAnchors(before, after);
  const changes: DocxRedlineChange[] = [];
  let beforeStart = 0;
  let afterStart = 0;
  for (const anchor of [...anchors, { beforeIndex: before.length, afterIndex: after.length }]) {
    changes.push(...alignBlockGap(
      before,
      after,
      beforeStart,
      anchor.beforeIndex,
      afterStart,
      anchor.afterIndex,
    ));
    beforeStart = anchor.beforeIndex + 1;
    afterStart = anchor.afterIndex + 1;
  }
  return changes;
}

export function summarizeDocxChanges(changes: readonly DocxRedlineChange[]) {
  let blocksAdded = 0;
  let blocksDeleted = 0;
  let blocksModified = 0;
  let wordsAdded = 0;
  let wordsDeleted = 0;
  for (const change of changes) {
    if (change.kind === "added") blocksAdded += 1;
    else if (change.kind === "deleted") blocksDeleted += 1;
    else blocksModified += 1;
    for (const segment of change.segments) {
      if (segment.kind === "add") wordsAdded += countWords(segment.text);
      if (segment.kind === "remove") wordsDeleted += countWords(segment.text);
    }
  }
  return {
    blocksAdded,
    blocksDeleted,
    blocksModified,
    blocksChanged: blocksAdded + blocksDeleted + blocksModified,
    wordsAdded,
    wordsDeleted,
  };
}

function findUniqueAnchors(before: readonly DocxNormalizedBlock[], after: readonly DocxNormalizedBlock[]) {
  const beforeLocations = uniqueBlockLocations(before);
  const afterLocations = uniqueBlockLocations(after);
  const candidates = [...beforeLocations.entries()]
    .filter(([key, indexes]) => indexes.length === 1 && afterLocations.get(key)?.length === 1)
    .map(([key, indexes]) => ({ beforeIndex: indexes[0], afterIndex: afterLocations.get(key)![0] }))
    .sort((left, right) => left.beforeIndex - right.beforeIndex);

  const tails: number[] = [];
  const predecessors = new Array(candidates.length).fill(-1);
  const tailCandidateIndexes: number[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const value = candidates[index].afterIndex;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (tails[middle] < value) low = middle + 1;
      else high = middle;
    }
    tails[low] = value;
    predecessors[index] = low > 0 ? tailCandidateIndexes[low - 1] : -1;
    tailCandidateIndexes[low] = index;
  }
  if (tails.length === 0) return [];
  const result = [];
  let cursor = tailCandidateIndexes[tails.length - 1];
  while (cursor >= 0) {
    result.push(candidates[cursor]);
    cursor = predecessors[cursor];
  }
  return result.reverse();
}

function alignBlockGap(
  before: readonly DocxNormalizedBlock[],
  after: readonly DocxNormalizedBlock[],
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
) {
  const left = before.slice(beforeStart, beforeEnd);
  const right = after.slice(afterStart, afterEnd);
  if (left.length === 0) return right.map((block, index) => addedChange(block, afterStart + index));
  if (right.length === 0) return left.map((block, index) => deletedChange(block, beforeStart + index));
  if (left.length * right.length > DOCX_REDLINE_BUDGET.maxAlignmentCells) {
    return alignLargeGap(left, right, beforeStart, afterStart);
  }

  const columns = right.length + 1;
  const directions = new Uint8Array((left.length + 1) * columns);
  let previous = new Float64Array(columns);
  for (let column = 1; column < columns; column += 1) previous[column] = column;

  for (let row = 1; row <= left.length; row += 1) {
    const current = new Float64Array(columns);
    current[0] = row;
    for (let column = 1; column < columns; column += 1) {
      const similarity = blockSimilarity(left[row - 1], right[column - 1]);
      const diagonalCost = left[row - 1].kind === right[column - 1].kind && similarity >= 0.2
        ? previous[column - 1] + (1 - similarity) * 1.25
        : previous[column - 1] + 2.1;
      const deleteCost = previous[column] + 1;
      const addCost = current[column - 1] + 1;
      const offset = row * columns + column;
      if (diagonalCost <= deleteCost && diagonalCost <= addCost) {
        current[column] = diagonalCost;
        directions[offset] = 0;
      } else if (deleteCost <= addCost) {
        current[column] = deleteCost;
        directions[offset] = 1;
      } else {
        current[column] = addCost;
        directions[offset] = 2;
      }
    }
    previous = current;
  }

  const reversed: DocxRedlineChange[] = [];
  let row = left.length;
  let column = right.length;
  while (row > 0 || column > 0) {
    const direction = row === 0 ? 2 : column === 0 ? 1 : directions[row * columns + column];
    if (direction === 0) {
      const beforeBlock = left[row - 1];
      const afterBlock = right[column - 1];
      if (beforeBlock.text !== afterBlock.text || beforeBlock.kind !== afterBlock.kind) {
        reversed.push(modifiedChange(
          beforeBlock,
          afterBlock,
          beforeStart + row - 1,
          afterStart + column - 1,
        ));
      }
      row -= 1;
      column -= 1;
    } else if (direction === 1) {
      reversed.push(deletedChange(left[row - 1], beforeStart + row - 1));
      row -= 1;
    } else {
      reversed.push(addedChange(right[column - 1], afterStart + column - 1));
      column -= 1;
    }
  }
  return reversed.reverse();
}

function alignLargeGap(
  before: readonly DocxNormalizedBlock[],
  after: readonly DocxNormalizedBlock[],
  beforeStart: number,
  afterStart: number,
) {
  const changes: DocxRedlineChange[] = [];
  const paired = Math.min(before.length, after.length);
  for (let index = 0; index < paired; index += 1) {
    if (before[index].kind === after[index].kind && blockSimilarity(before[index], after[index]) >= 0.35) {
      if (before[index].text !== after[index].text) {
        changes.push(modifiedChange(before[index], after[index], beforeStart + index, afterStart + index));
      }
    } else {
      changes.push(deletedChange(before[index], beforeStart + index));
      changes.push(addedChange(after[index], afterStart + index));
    }
  }
  for (let index = paired; index < before.length; index += 1) {
    changes.push(deletedChange(before[index], beforeStart + index));
  }
  for (let index = paired; index < after.length; index += 1) {
    changes.push(addedChange(after[index], afterStart + index));
  }
  return changes;
}

function modifiedChange(
  before: DocxNormalizedBlock,
  after: DocxNormalizedBlock,
  beforeIndex: number,
  afterIndex: number,
): DocxRedlineChange {
  return {
    id: `modified:${beforeIndex}:${afterIndex}`,
    kind: "modified",
    blockKind: after.kind,
    beforeIndex,
    afterIndex,
    segments: diffWords(before.text, after.text),
  };
}

function addedChange(block: DocxNormalizedBlock, afterIndex: number): DocxRedlineChange {
  return {
    id: `added:${afterIndex}`,
    kind: "added",
    blockKind: block.kind,
    beforeIndex: null,
    afterIndex,
    segments: [{ kind: "add", text: block.text }],
  };
}

function deletedChange(block: DocxNormalizedBlock, beforeIndex: number): DocxRedlineChange {
  return {
    id: `deleted:${beforeIndex}`,
    kind: "deleted",
    blockKind: block.kind,
    beforeIndex,
    afterIndex: null,
    segments: [{ kind: "remove", text: block.text }],
  };
}

function diffWords(before: string, after: string): DocxRedlineSegment[] {
  const left = tokenizeWords(before);
  const right = tokenizeWords(after);
  if (left.length * right.length > DOCX_REDLINE_BUDGET.maxWordDiffCells) {
    return compactSegments([
      ...(before ? [{ kind: "remove" as const, text: before }] : []),
      ...(after ? [{ kind: "add" as const, text: after }] : []),
    ]);
  }
  const columns = right.length + 1;
  const lengths = new Uint32Array((left.length + 1) * columns);
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const offset = row * columns + column;
      lengths[offset] = left[row - 1] === right[column - 1]
        ? lengths[(row - 1) * columns + column - 1] + 1
        : Math.max(lengths[(row - 1) * columns + column], lengths[row * columns + column - 1]);
    }
  }
  const reversed: DocxRedlineSegment[] = [];
  let row = left.length;
  let column = right.length;
  while (row > 0 || column > 0) {
    if (row > 0 && column > 0 && left[row - 1] === right[column - 1]) {
      reversed.push({ kind: "equal", text: left[row - 1] });
      row -= 1;
      column -= 1;
    } else if (column > 0 && (row === 0 || lengths[row * columns + column - 1] >= lengths[(row - 1) * columns + column])) {
      reversed.push({ kind: "add", text: right[column - 1] });
      column -= 1;
    } else {
      reversed.push({ kind: "remove", text: left[row - 1] });
      row -= 1;
    }
  }
  return compactSegments(reversed.reverse());
}

function compactSegments(segments: DocxRedlineSegment[]) {
  const compacted: DocxRedlineSegment[] = [];
  for (const segment of segments) {
    const previous = compacted.at(-1);
    if (previous?.kind === segment.kind) previous.text += segment.text;
    else compacted.push({ ...segment });
  }
  return compacted;
}

function uniqueBlockLocations(blocks: readonly DocxNormalizedBlock[]) {
  const locations = new Map<string, number[]>();
  blocks.forEach((block, index) => {
    const key = `${block.kind}\0${block.text}`;
    const indexes = locations.get(key) ?? [];
    indexes.push(index);
    locations.set(key, indexes);
  });
  return locations;
}

function blockSimilarity(left: DocxNormalizedBlock, right: DocxNormalizedBlock) {
  if (left.kind !== right.kind) return 0;
  if (left.text === right.text) return 1;
  const leftWords = new Set(left.text.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);
  const rightWords = new Set(right.text.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  let shared = 0;
  for (const word of leftWords) if (rightWords.has(word)) shared += 1;
  return (2 * shared) / (leftWords.size + rightWords.size);
}

function tokenizeWords(value: string) {
  return value.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+/gu) ?? [];
}

function countWords(value: string) {
  return value.match(/[\p{L}\p{N}_]+/gu)?.length ?? 0;
}
