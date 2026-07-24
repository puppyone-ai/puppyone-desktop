import { describe, expect, it } from "vitest";
import {
  getCsvTableExpansionFromDrag,
  getCsvTableResizePreviewGeometry,
  getCsvTableResizeViewportConstraints,
} from "../packages/shared-ui/src/editor/csv/CsvTableResizeControl";

describe("CSV table corner resize geometry", () => {
  it("quantizes outward distance into rows and columns", () => {
    expect(getCsvTableExpansionFromDrag({
      horizontalDistance: 193,
      verticalDistance: 63,
      rowHeight: 31,
      columnWidth: 96,
      maximumAddedRows: 100,
      maximumAddedColumns: 100,
    })).toEqual({ addedRows: 3, addedColumns: 3 });
  });

  it("never turns inward movement into a shrinking operation", () => {
    expect(getCsvTableExpansionFromDrag({
      horizontalDistance: -200,
      verticalDistance: -200,
      rowHeight: 31,
      columnWidth: 96,
      maximumAddedRows: 100,
      maximumAddedColumns: 100,
    })).toEqual({ addedRows: 0, addedColumns: 0 });
  });

  it("clamps expansion to the remaining safety budget", () => {
    expect(getCsvTableExpansionFromDrag({
      horizontalDistance: 10000,
      verticalDistance: 10000,
      rowHeight: 31,
      columnWidth: 96,
      maximumAddedRows: 4,
      maximumAddedColumns: 2,
    })).toEqual({ addedRows: 4, addedColumns: 2 });
  });

  it("keeps the record gutter separate while reusing actual data-column widths", () => {
    expect(getCsvTableResizePreviewGeometry({
      addedColumns: 2,
      addedRows: 3,
      columnWidth: 96,
      currentColumnCount: 2,
      currentColumnWidths: [128, 214],
      rowHeight: 31,
    })).toEqual({
      addedBlockSize: 93,
      addedColumnWidth: 96,
      addedInlineSize: 192,
      dataColumnWidths: [128, 214, 96, 96],
      rowHeight: 31,
    });
  });

  it("normalizes missing geometry without folding the record gutter into a data track", () => {
    expect(getCsvTableResizePreviewGeometry({
      addedColumns: 1,
      addedRows: 1,
      columnWidth: 0,
      currentColumnCount: 3,
      currentColumnWidths: [140],
      rowHeight: Number.NaN,
    })).toEqual({
      addedBlockSize: 31,
      addedColumnWidth: 96,
      addedInlineSize: 96,
      dataColumnWidths: [140, 96, 96, 96],
      rowHeight: 31,
    });
  });

  it("uses all remaining editor space while keeping complete tracks inside the viewport", () => {
    expect(getCsvTableResizeViewportConstraints({
      columnWidth: 96,
      direction: "ltr",
      editorRect: { bottom: 670, left: 80, right: 880, top: 70 },
      maximumAddedColumns: 100,
      maximumAddedRows: 100,
      rowHeight: 31,
      surfaceRect: { bottom: 193, left: 100, right: 323, top: 100 },
    })).toEqual({
      maximumAddedColumns: 5,
      maximumAddedRows: 15,
      pointerBounds: { bottom: 670, left: 80, right: 880, top: 70 },
    });
  });

  it("measures outward inline space from the opposite edge in RTL", () => {
    expect(getCsvTableResizeViewportConstraints({
      columnWidth: 96,
      direction: "rtl",
      editorRect: { bottom: 600, left: 0, right: 800, top: 0 },
      maximumAddedColumns: 100,
      maximumAddedRows: 100,
      rowHeight: 31,
      surfaceRect: { bottom: 197, left: 220, right: 443, top: 104 },
    })).toMatchObject({
      maximumAddedColumns: 2,
      maximumAddedRows: 13,
    });
  });
});
