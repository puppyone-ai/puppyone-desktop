import { SaxesParser, type SaxesAttributeNS, type SaxesTagNS } from "saxes";
import { DOCX_REDLINE_BUDGET, createDocxLimitError } from "../budget";
import type { DocxBlockKind, DocxNormalizedBlock } from "../model";

const WORDPROCESSING_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);

export function normalizeDocxDocumentXml(xml: string): DocxNormalizedBlock[] {
  const blocks: DocxNormalizedBlock[] = [];
  let paragraph: { parts: string[]; style: string; list: boolean } | null = null;
  let row: { cells: string[] } | null = null;
  let cellParts: string[] | null = null;
  let tableDepth = 0;
  let deletedDepth = 0;
  let textDepth = 0;
  let xmlDepth = 0;
  let startTags = 0;
  let textCharacters = 0;

  const appendText = (value: string) => {
    if (!value || deletedDepth > 0 || textDepth === 0 || !paragraph) return;
    textCharacters += value.length;
    if (textCharacters > DOCX_REDLINE_BUDGET.maxTextCharacters) {
      throw createDocxLimitError("Word text exceeds the semantic diff character budget.");
    }
    paragraph.parts.push(value);
  };
  const appendControl = (value: string) => {
    if (paragraph && deletedDepth === 0) paragraph.parts.push(value);
  };
  const pushBlock = (block: Omit<DocxNormalizedBlock, "sourceIndex">) => {
    if (blocks.length >= DOCX_REDLINE_BUDGET.maxBlocks) {
      throw createDocxLimitError("Word document exceeds the semantic block budget.");
    }
    blocks.push({ ...block, sourceIndex: blocks.length });
  };

  const parser = new SaxesParser({ xmlns: true });
  parser.on("doctype", () => {
    const error = new Error("Word document XML must not contain a document type declaration.");
    error.name = "DocxStructureError";
    throw error;
  });
  parser.on("opentag", (tag) => {
    xmlDepth += 1;
    startTags += 1;
    if (xmlDepth > DOCX_REDLINE_BUDGET.maxXmlDepth) {
      throw createDocxLimitError("Word document XML exceeds the nesting-depth budget.");
    }
    if (startTags > DOCX_REDLINE_BUDGET.maxXmlStartTags) {
      throw createDocxLimitError("Word document XML exceeds the element budget.");
    }
    if (!isWordprocessingTag(tag)) return;

    if (tag.local === "tbl") tableDepth += 1;
    if (tag.local === "tr" && tableDepth === 1) row = { cells: [] };
    if (tag.local === "tc" && tableDepth === 1 && row) cellParts = [];
    if (tag.local === "p") paragraph = { parts: [], style: "", list: false };
    if (tag.local === "del" || tag.local === "moveFrom") deletedDepth += 1;
    if (tag.local === "t") textDepth += 1;
    if (tag.local === "pStyle" && paragraph) paragraph.style = readWordAttribute(tag, "val") ?? "";
    if (tag.local === "numPr" && paragraph) paragraph.list = true;
    if (tag.local === "tab") appendControl("\t");
    if (tag.local === "br" || tag.local === "cr") appendControl("\n");
  });
  parser.on("text", appendText);
  parser.on("cdata", appendText);
  parser.on("closetag", (tag) => {
    if (isWordprocessingTag(tag)) {
      if (tag.local === "t") textDepth = Math.max(0, textDepth - 1);
      if (tag.local === "p" && paragraph) {
        const text = normalizeBlockText(paragraph.parts.join(""));
        if (tableDepth > 0 && cellParts) {
          if (text) cellParts.push(text);
        } else if (text) {
          pushBlock({ kind: paragraphKind(paragraph.style, paragraph.list), text });
        }
        paragraph = null;
      }
      if (tag.local === "tc" && tableDepth === 1 && row && cellParts) {
        row.cells.push(normalizeBlockText(cellParts.join("\n")));
        cellParts = null;
      }
      if (tag.local === "tr" && tableDepth === 1 && row) {
        const cells = row.cells;
        const text = cells.join(" | ").trim();
        if (text) pushBlock({ kind: "table-row", text, cells });
        row = null;
      }
      if (tag.local === "del" || tag.local === "moveFrom") {
        deletedDepth = Math.max(0, deletedDepth - 1);
      }
      if (tag.local === "tbl") tableDepth = Math.max(0, tableDepth - 1);
    }
    xmlDepth = Math.max(0, xmlDepth - 1);
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof Error && error.name.startsWith("Docx")) throw error;
    const wrapped = new Error(`Word document XML is malformed: ${error instanceof Error ? error.message : String(error)}`);
    wrapped.name = "DocxStructureError";
    throw wrapped;
  }
  return blocks;
}

function isWordprocessingTag(tag: SaxesTagNS) {
  return WORDPROCESSING_NAMESPACES.has(tag.uri);
}

function readWordAttribute(tag: SaxesTagNS, localName: string) {
  return Object.values(tag.attributes)
    .find((attribute: SaxesAttributeNS) => (
      attribute.local === localName && WORDPROCESSING_NAMESPACES.has(attribute.uri)
    ))?.value ?? null;
}

function paragraphKind(style: string, list: boolean): DocxBlockKind {
  if (/^heading\s*\d*$/i.test(style) || /^title$/i.test(style)) return "heading";
  if (list) return "list-item";
  return "paragraph";
}

function normalizeBlockText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}
