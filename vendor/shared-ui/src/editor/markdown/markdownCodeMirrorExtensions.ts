import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  type ChangeSpec,
  type Extension,
  type Range,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  type MouseSelectionStyle,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  placeholder,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import {
  getMarkdownTableBlock,
  isMarkdownTableLine,
} from "./rendering/tableModel";
import { getMarkdownTaskLine, type MarkdownTaskLine } from "./rendering/taskModel";
import { getMarkdownHtmlBlock, type MarkdownHtmlBlock } from "./rendering/htmlBlockModel";
import { isSafeHref } from "./rendering/markdownHtmlPolicy";
import { puppyMarkdownParserExtensions } from "./syntax/markdownParserExtensions";
import {
  markdownAssetUrlResolverFacet,
  markdownDocumentPathFacet,
  markdownHtmlTrustModeFacet,
  markdownLinkGraphFacet,
  markdownLivePreviewContextExtension,
} from "./markdownLivePreviewContext";
import {
  getBlockMarkerAtVisibleStart,
  getInlineRevealElement,
  getMarkdownElements,
  isInlineRevealKind,
  type MarkdownElement,
} from "./syntax/markdownElements";
import { findMarkdownImageTokens } from "./links/markdownImageModel";
import { findMarkdownLinkTokens, isExternalMarkdownHref } from "./links/markdownLinkModel";
import { findWikiLinkTokens } from "./links/wikiLinkModel";
import { markdownExpandedImageEffect, type ExpandedImageRange } from "./markdownLivePreviewState";
import {
  CodeBlockWidget,
  HiddenMarkdownSyntaxWidget,
  HorizontalRuleWidget,
  HtmlBlockWidget,
  ImagePreviewWidget,
  MarkdownTableWidget,
  TaskCheckboxWidget,
  type MarkdownSourceSyntaxKind,
} from "./widgets/markdownLivePreviewWidgets";
import type { MarkdownAssetUrlResolver, MarkdownHtmlTrustMode, MarkdownLinkGraph } from "../viewerTypes";

type LivePreviewDecorations = {
  decorations: DecorationSet;
  atomicRanges: DecorationSet;
  focused: boolean;
  inputComposing: boolean;
  composingLineKey: string;
  revealSetKey: string;
};

type MarkdownDecorationBuilders = {
  decorations: Range<Decoration>[];
  atomicRanges: Range<Decoration>[];
};

type OccupiedRange = {
  from: number;
  to: number;
};

type InlineRevealRange = {
  from: number;
  to: number;
};

type ComposingBlockLine = {
  from: number;
  to: number;
};

type MarkdownCodeBlock = {
  from: number;
  to: number;
  nextLineNumber: number;
  language: string;
  code: string;
};

export function markdownCodeMirrorBaseExtensions(readOnly: boolean): Extension[] {
  return [
    highlightSpecialChars(),
    history(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    markdown({ base: markdownLanguage, extensions: puppyMarkdownParserExtensions }),
    syntaxHighlighting(puppyMarkdownHighlightStyle),
    EditorView.lineWrapping,
    trailingLineWhitespaceSelectionExtension,
    EditorView.contentAttributes.of({
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
    }),
    highlightActiveLine(),
    keymap.of([...markdownEditingKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
    placeholder(readOnly ? "" : "Start writing..."),
    puppyMarkdownEditorTheme,
  ];
}

export function markdownLivePreviewExtension(
  htmlTrustMode: MarkdownHtmlTrustMode = "safe",
  markdownLinkGraph: MarkdownLinkGraph | null = null,
  documentPath = "",
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null = null,
): Extension {
  return [
    markdownLivePreviewContextExtension(htmlTrustMode, markdownLinkGraph, documentPath, markdownAssetUrlResolver),
    markdownLivePreviewFocusExtension,
    markdownInputCompositionExtension,
    markdownComposingBlockLineField,
    markdownExpandedImageField,
    markdownLivePreviewDecorations,
  ];
}

const puppyMarkdownEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "inherit",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-line": {
    padding: "0",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

const puppyMarkdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, class: "cm-md-syntax-heading" },
  { tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6], class: "cm-md-syntax-heading" },
  { tag: tags.strong, class: "cm-md-syntax-strong" },
  { tag: tags.emphasis, class: "cm-md-syntax-emphasis" },
  { tag: tags.strikethrough, class: "cm-md-syntax-strikethrough" },
  { tag: [tags.link, tags.url], class: "cm-md-syntax-link" },
  { tag: tags.monospace, class: "cm-md-syntax-monospace" },
  { tag: [tags.meta, tags.processingInstruction, tags.punctuation, tags.contentSeparator], class: "cm-md-syntax-markup" },
  { tag: tags.quote, class: "cm-md-syntax-quote" },
  { tag: tags.list, class: "cm-md-syntax-list" },
]);

const markdownEditingKeymap = [
  { key: "Backspace", run: deleteMarkdownMarkerBackward },
  { key: "Delete", run: deleteMarkdownMarkerForward },
  { key: "Enter", run: handleMarkdownEnter },
  { key: "Home", run: moveMarkdownCaretToVisibleLineStart },
  { key: "Mod-ArrowLeft", run: moveMarkdownCaretToVisibleLineStart },
  { key: "Tab", run: indentMarkdownListItem },
  { key: "Shift-Tab", run: outdentMarkdownListItem },
  { key: "Mod-0", run: setMarkdownHeadingLevel(0), preventDefault: true },
  { key: "Mod-1", run: setMarkdownHeadingLevel(1), preventDefault: true },
  { key: "Mod-2", run: setMarkdownHeadingLevel(2), preventDefault: true },
  { key: "Mod-3", run: setMarkdownHeadingLevel(3), preventDefault: true },
  { key: "Mod-4", run: setMarkdownHeadingLevel(4), preventDefault: true },
  { key: "Mod-5", run: setMarkdownHeadingLevel(5), preventDefault: true },
  { key: "Mod-6", run: setMarkdownHeadingLevel(6), preventDefault: true },
  { key: "Mod-Shift-7", run: toggleMarkdownList("ordered"), preventDefault: true },
  { key: "Mod-Shift-8", run: toggleMarkdownList("bullet"), preventDefault: true },
  { key: "Mod-Shift-9", run: toggleMarkdownList("task"), preventDefault: true },
  { key: "Mod-Shift-.", run: toggleMarkdownQuote, preventDefault: true },
  { key: "Mod-b", run: toggleMarkdownInline("**"), preventDefault: true },
  { key: "Mod-i", run: toggleMarkdownInline("*"), preventDefault: true },
  { key: "Mod-e", run: toggleMarkdownInline("`"), preventDefault: true },
  { key: "Mod-Shift-x", run: toggleMarkdownInline("~~"), preventDefault: true },
  { key: "Mod-k", run: wrapMarkdownLink, preventDefault: true },
];

const TRAILING_LINE_WHITESPACE_SELECTION_GAP = 3;

const trailingLineWhitespaceSelectionExtension = EditorView.mouseSelectionStyle.of((view, event) => {
  if (event.button !== 0 || event.detail !== 1 || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
    return null;
  }

  const start = view.posAndSideAtCoords({ x: event.clientX, y: event.clientY }, false);
  const startEdge = getTrailingLineSelectionEdge(view, start.pos);
  if (
    !startEdge ||
    event.clientY < startEdge.top ||
    event.clientY > startEdge.bottom ||
    event.clientX <= startEdge.x + TRAILING_LINE_WHITESPACE_SELECTION_GAP
  ) {
    return null;
  }

  let anchor = startEdge.pos;
  return {
    get(curEvent) {
      const currentEdge = getTrailingLineSelectionEdge(view, anchor) ?? startEdge;
      if (
        curEvent.clientY >= currentEdge.top &&
        curEvent.clientY <= currentEdge.bottom &&
        curEvent.clientX > currentEdge.x + TRAILING_LINE_WHITESPACE_SELECTION_GAP
      ) {
        return EditorSelection.create([EditorSelection.cursor(anchor, -1)]);
      }

      const head = view.posAndSideAtCoords({ x: curEvent.clientX, y: curEvent.clientY }, false);
      return EditorSelection.create([EditorSelection.range(anchor, head.pos, undefined, undefined, head.assoc)]);
    },
    update(update) {
      if (!update.docChanged) return false;
      anchor = update.changes.mapPos(anchor);
      return true;
    },
  } satisfies MouseSelectionStyle;
});

function getTrailingLineSelectionEdge(
  view: EditorView,
  pos: number,
): { pos: number; x: number; top: number; bottom: number } | null {
  const line = view.state.doc.lineAt(pos);
  if (line.from === line.to) return null;

  const edgeRect = view.coordsAtPos(line.to, -1);
  if (!edgeRect) return null;

  return {
    pos: line.to,
    x: Math.max(edgeRect.left, edgeRect.right),
    top: edgeRect.top,
    bottom: edgeRect.bottom,
  };
}

function deleteMarkdownMarkerBackward(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly || state.selection.ranges.length !== 1) return false;

  const selection = state.selection.main;
  if (!selection.empty) return false;

  const deletion =
    getBlockMarkerAtVisibleStart(state, selection.from) ??
    getCollapsedInlineMarkerDeletion(state, selection.from, "backward");
  if (!deletion) return false;

  view.dispatch({
    changes: deletion,
    selection: EditorSelection.cursor(deletion.from),
  });
  return true;
}

function deleteMarkdownMarkerForward(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly || state.selection.ranges.length !== 1) return false;

  const selection = state.selection.main;
  if (!selection.empty) return false;

  const deletion = getCollapsedInlineMarkerDeletion(state, selection.from, "forward");
  if (!deletion) return false;

  view.dispatch({
    changes: deletion,
    selection: EditorSelection.cursor(deletion.from),
  });
  return true;
}

function getCollapsedInlineMarkerDeletion(
  state: EditorState,
  caret: number,
  direction: "backward" | "forward",
): { from: number; to: number } | null {
  const elements = getMarkdownElements(state);
  for (const element of elements) {
    if (!isInlineRevealKind(element.kind)) continue;
    const markerRange = direction === "backward"
      ? element.markerRanges[element.markerRanges.length - 1]
      : element.markerRanges[0];
    if (!markerRange) continue;
    if (direction === "backward" && caret === element.to) return markerRange;
    if (direction === "forward" && caret === element.from) return markerRange;
  }
  return null;
}

function setMarkdownHeadingLevel(level: 0 | 1 | 2 | 3 | 4 | 5 | 6) {
  return (view: EditorView): boolean => {
    const { state } = view;
    if (state.readOnly) return false;

    const changes: ChangeSpec[] = [];
    const touchedLines = new Set<number>();
    const marker = level > 0 ? `${"#".repeat(level)} ` : "";

    for (const range of state.selection.ranges) {
      const fromLine = state.doc.lineAt(range.from);
      const toLine = state.doc.lineAt(range.to);
      for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
        if (touchedLines.has(lineNumber)) continue;
        touchedLines.add(lineNumber);

        const line = state.doc.line(lineNumber);
        const headingMatch = /^(#{1,6})(\s|$)/.exec(line.text);
        const replaceTo = line.from + (headingMatch?.[0].length ?? 0);
        if (state.sliceDoc(line.from, replaceTo) === marker) continue;
        changes.push({ from: line.from, to: replaceTo, insert: marker });
      }
    }

    if (changes.length > 0) view.dispatch({ changes });
    return true;
  };
}

function toggleMarkdownList(kind: "bullet" | "ordered" | "task") {
  return (view: EditorView): boolean => {
    const { state } = view;
    if (state.readOnly) return false;

    const lines = getSelectedLineNumbers(state);
    const allMatching = lines.every((lineNumber) => {
      const text = state.doc.line(lineNumber).text;
      if (kind === "task") return /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+/.test(text);
      if (kind === "ordered") return /^\s*\d+[.)]\s+/.test(text);
      return /^\s*[-*+]\s+/.test(text) && !/^\s*[-*+]\s+\[[ xX]\]\s+/.test(text);
    });

    const changes: ChangeSpec[] = [];
    lines.forEach((lineNumber, index) => {
      const line = state.doc.line(lineNumber);
      const leadingWhitespace = /^\s*/.exec(line.text)?.[0] ?? "";
      const markerMatch = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/.exec(line.text);
      const markerTo = markerMatch ? line.from + markerMatch[0].length : line.from + leadingWhitespace.length;
      const markerFrom = line.from + leadingWhitespace.length;

      if (allMatching) {
        if (markerMatch) changes.push({ from: markerFrom, to: markerTo, insert: "" });
        return;
      }

      const marker = kind === "ordered" ? `${index + 1}. ` : kind === "task" ? "- [ ] " : "- ";
      changes.push({ from: markerFrom, to: markerTo, insert: marker });
    });

    if (changes.length === 0) return false;
    view.dispatch({ changes });
    if (kind === "ordered") renumberOrderedLists(view);
    return true;
  };
}

function toggleMarkdownQuote(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly) return false;

  const lines = getSelectedLineNumbers(state);
  const allQuoted = lines.every((lineNumber) => /^\s*>\s?/.test(state.doc.line(lineNumber).text));
  const changes: ChangeSpec[] = [];

  for (const lineNumber of lines) {
    const line = state.doc.line(lineNumber);
    const leadingWhitespace = /^\s*/.exec(line.text)?.[0] ?? "";
    if (allQuoted) {
      const quoteMatch = /^(\s*)>\s?/.exec(line.text);
      if (quoteMatch) changes.push({ from: line.from + quoteMatch[1].length, to: line.from + quoteMatch[0].length, insert: "" });
      continue;
    }
    changes.push({ from: line.from + leadingWhitespace.length, insert: "> " });
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}

function handleMarkdownEnter(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly || state.selection.ranges.length !== 1) return false;
  if (expandSelectedMarkdownImage(view)) return true;

  const selection = state.selection.main;
  if (!selection.empty) return false;

  const line = state.doc.lineAt(selection.from);
  const prefix = getContinuationPrefix(line.text);
  if (!prefix) return false;

  const content = getListOrQuoteContent(line.text);
  if (selection.from === line.to && content.trim() === "") {
    const marker = getLineMarkerPrefixRange(line.from, line.text);
    if (!marker) return false;
    view.dispatch({
      changes: { from: marker.from, to: marker.to, insert: "" },
      selection: EditorSelection.cursor(marker.from),
    });
    return true;
  }

  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: `\n${prefix}` },
    selection: EditorSelection.cursor(selection.from + 1 + prefix.length),
  });
  renumberOrderedLists(view);
  return true;
}

function expandSelectedMarkdownImage(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (selection.empty) return false;

  const imageElement = getMarkdownElements(view.state).find((element) => (
    element.kind === "image" &&
    element.from === selection.from &&
    element.to === selection.to
  ));
  if (!imageElement) return false;

  view.dispatch({
    effects: markdownExpandedImageEffect.of({ from: imageElement.from, to: imageElement.to }),
    selection: EditorSelection.cursor(imageElement.from + 2),
  });
  return true;
}

function moveMarkdownCaretToVisibleLineStart(view: EditorView): boolean {
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false;

  const selection = state.selection.main;
  if (!selection.empty) return false;

  const line = state.doc.lineAt(selection.from);
  const visibleStart = getMarkdownVisibleLineStart(state, line.from);
  if (visibleStart == null || selection.from === visibleStart) return false;

  view.dispatch({ selection: EditorSelection.cursor(visibleStart) });
  return true;
}

function getMarkdownVisibleLineStart(state: EditorState, lineFrom: number): number | null {
  const element = getMarkdownElements(state).find((candidate) => (
    candidate.lineFrom === lineFrom &&
    (candidate.kind === "blockquote" || candidate.kind === "heading" || candidate.kind === "list" || candidate.kind === "task")
  ));
  if (!element) return null;
  return element.markerRanges.reduce((start, range) => Math.max(start, range.to), element.from);
}

function indentMarkdownListItem(view: EditorView): boolean {
  return adjustMarkdownListIndent(view, 1);
}

function outdentMarkdownListItem(view: EditorView): boolean {
  return adjustMarkdownListIndent(view, -1);
}

function adjustMarkdownListIndent(view: EditorView, direction: 1 | -1): boolean {
  const { state } = view;
  if (state.readOnly) return false;

  const changes: ChangeSpec[] = [];
  const touchedLines = getSelectedLineNumbers(state);
  for (const lineNumber of touchedLines) {
    const line = state.doc.line(lineNumber);
    if (!/^\s*(?:[-*+]|\d+[.)])\s+/.test(line.text)) continue;
    if (direction > 0) {
      changes.push({ from: line.from, to: line.from, insert: "  " });
      continue;
    }

    const outdentWidth = line.text.startsWith("  ") ? 2 : line.text.startsWith("\t") ? 1 : 0;
    if (outdentWidth > 0) changes.push({ from: line.from, to: line.from + outdentWidth, insert: "" });
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes });
  renumberOrderedLists(view);
  return true;
}

function toggleMarkdownInline(delimiter: "**" | "*" | "`" | "~~") {
  return (view: EditorView): boolean => {
    const { state } = view;
    if (state.readOnly || state.selection.ranges.length !== 1) return false;

    const selection = state.selection.main;
    const range = selection.empty ? getWordRangeAt(state, selection.from) : { from: selection.from, to: selection.to };
    if (!range || range.from === range.to) return false;

    const beforeFrom = Math.max(0, range.from - delimiter.length);
    const afterTo = Math.min(state.doc.length, range.to + delimiter.length);
    const before = state.sliceDoc(beforeFrom, range.from);
    const after = state.sliceDoc(range.to, afterTo);

    if (before === delimiter && after === delimiter) {
      view.dispatch({
        changes: [
          { from: range.to, to: afterTo, insert: "" },
          { from: beforeFrom, to: range.from, insert: "" },
        ],
        selection: EditorSelection.range(beforeFrom, range.to - delimiter.length),
      });
      return true;
    }

    view.dispatch({
      changes: [
        { from: range.to, insert: delimiter },
        { from: range.from, insert: delimiter },
      ],
      selection: EditorSelection.range(range.from + delimiter.length, range.to + delimiter.length),
    });
    return true;
  };
}

function wrapMarkdownLink(view: EditorView): boolean {
  const { state } = view;
  if (state.readOnly || state.selection.ranges.length !== 1) return false;

  const selection = state.selection.main;
  const range = selection.empty ? getWordRangeAt(state, selection.from) : { from: selection.from, to: selection.to };
  if (!range || range.from === range.to) return false;

  const selectedText = state.sliceDoc(range.from, range.to);
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `[${selectedText}]()` },
    selection: EditorSelection.cursor(range.from + selectedText.length + 3),
  });
  return true;
}

function getSelectedLineNumbers(state: EditorState): number[] {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);
    for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
      lines.add(lineNumber);
    }
  }
  return [...lines].sort((left, right) => left - right);
}

function getWordRangeAt(state: EditorState, pos: number): { from: number; to: number } | null {
  const line = state.doc.lineAt(pos);
  const offset = pos - line.from;
  const isWord = (char: string | undefined) => Boolean(char && /[\p{L}\p{N}_-]/u.test(char));
  let fromOffset = offset;
  let toOffset = offset;
  while (fromOffset > 0 && isWord(line.text[fromOffset - 1])) fromOffset -= 1;
  while (toOffset < line.text.length && isWord(line.text[toOffset])) toOffset += 1;
  if (fromOffset === toOffset) return null;
  return { from: line.from + fromOffset, to: line.from + toOffset };
}

function getContinuationPrefix(text: string): string | null {
  const taskMatch = /^(\s*)([-*+]|\d+[.)])\s+\[[ xX]\]\s+/.exec(text);
  if (taskMatch) return `${taskMatch[1]}${getNextListMarker(taskMatch[2])} [ ] `;

  const listMatch = /^(\s*)([-*+]|\d+[.)])\s+/.exec(text);
  if (listMatch) return `${listMatch[1]}${getNextListMarker(listMatch[2])} `;

  const quoteMatch = /^(\s*>+\s?)/.exec(text);
  if (quoteMatch) return quoteMatch[1].endsWith(" ") ? quoteMatch[1] : `${quoteMatch[1]} `;

  return null;
}

function getListOrQuoteContent(text: string): string {
  return text
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/, "")
    .replace(/^\s*>+\s?/, "");
}

function getLineMarkerPrefixRange(lineFrom: number, text: string): { from: number; to: number } | null {
  const match = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?|\s*>+\s?)/.exec(text);
  if (!match) return null;
  return { from: lineFrom, to: lineFrom + match[0].length };
}

function getNextListMarker(marker: string): string {
  const orderedMatch = /^(\d+)([.)])$/.exec(marker);
  if (!orderedMatch) return marker;
  return `${Number.parseInt(orderedMatch[1], 10) + 1}${orderedMatch[2]}`;
}

function renumberOrderedLists(view: EditorView) {
  const { state } = view;
  const changes: ChangeSpec[] = [];
  const countersByIndent = new Map<string, number>();

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const match = /^(\s*)(\d+)([.)])\s+/.exec(line.text);
    if (!match) {
      if (!/^\s*(?:[-*+]|\d+[.)])\s+/.test(line.text)) countersByIndent.clear();
      continue;
    }

    const indentKey = match[1].replace(/\t/g, "  ");
    const nextNumber = (countersByIndent.get(indentKey) ?? 0) + 1;
    countersByIndent.set(indentKey, nextNumber);
    if (match[2] === String(nextNumber)) continue;

    const markerFrom = line.from + match[1].length;
    changes.push({ from: markerFrom, to: markerFrom + match[2].length, insert: String(nextNumber) });
  }

  if (changes.length > 0) view.dispatch({ changes });
}

const markdownComposingBlockLineField = StateField.define<ComposingBlockLine | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    if (getLivePreviewFocusState(true, transaction.effects) === false) return null;
    if (transaction.isUserEvent("input.paste") || transaction.isUserEvent("input.drop")) return null;

    let next = value
      ? {
          from: transaction.changes.mapPos(value.from),
          to: transaction.changes.mapPos(value.to),
        }
      : null;

    const selection = transaction.state.selection.main;
    const selectionLine = transaction.state.doc.lineAt(selection.head);
    if (next && selectionLine.from !== next.from) next = null;

    if (
      transaction.docChanged &&
      (transaction.isUserEvent("input.type") ||
        transaction.isUserEvent("delete.backward") ||
        transaction.isUserEvent("delete.forward"))
    ) {
      const composingRange = getComposingBlockPrefixRange(selectionLine.from, selectionLine.text);
      if (composingRange && transactionTouchesRange(transaction, composingRange.from, composingRange.to)) {
        return { from: selectionLine.from, to: selectionLine.to };
      }
    }

    return next;
  },
});

const markdownInputCompositionEffect = StateEffect.define<boolean>();

const markdownInputCompositionExtension = EditorView.domEventHandlers({
  compositionstart(_event, view) {
    view.dispatch({ effects: markdownInputCompositionEffect.of(true) });
    return false;
  },
  compositionend(_event, view) {
    view.dispatch({ effects: markdownInputCompositionEffect.of(false) });
    return false;
  },
});

function getInputCompositionState(inputComposing: boolean, effects: readonly StateEffect<unknown>[]): boolean {
  for (const effect of effects) {
    if (effect.is(markdownInputCompositionEffect)) return effect.value;
  }
  return inputComposing;
}

function getComposingBlockLineKey(state: EditorState): string {
  const line = state.field(markdownComposingBlockLineField, false);
  return line ? `${line.from}:${line.to}` : "";
}

function getComposingBlockPrefixRange(lineFrom: number, text: string): { from: number; to: number } | null {
  const match = /^(#{1,6}\s?|\s*>+\s?|\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?|\s{0,3}(?:`{3,}|~{3,})[^\n`]*|\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*|\|.*\|)/.exec(text);
  if (!match) return null;
  return { from: lineFrom, to: lineFrom + match[0].length };
}

function transactionTouchesRange(transaction: Transaction, from: number, to: number): boolean {
  let touches = false;
  transaction.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    if (fromB <= to && Math.max(fromB, toB) >= from) touches = true;
  });
  return touches;
}

const markdownExpandedImageField = StateField.define<ExpandedImageRange | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(markdownExpandedImageEffect)) return effect.value;
    }

    const mapped = value
      ? {
          from: transaction.changes.mapPos(value.from),
          to: transaction.changes.mapPos(value.to),
        }
      : null;
    if (!mapped) return null;

    const selection = transaction.state.selection.main;
    if (selection.from >= mapped.from && selection.to <= mapped.to) return mapped;
    return null;
  },
});

const markdownLivePreviewDecorations = StateField.define<LivePreviewDecorations>({
  create(state) {
    return buildMarkdownDecorations(state, false, false);
  },
  update(decorations, transaction) {
    const focused = getLivePreviewFocusState(decorations.focused, transaction.effects);
    const inputComposing = getInputCompositionState(decorations.inputComposing, transaction.effects);
    const composingLineKey = getComposingBlockLineKey(transaction.state);
    const revealSetKey = getLivePreviewRevealSetKey(transaction.state, focused);
    if (inputComposing && transaction.docChanged && !transaction.reconfigured) {
      return {
        decorations: decorations.decorations.map(transaction.changes),
        atomicRanges: decorations.atomicRanges.map(transaction.changes),
        focused,
        inputComposing,
        composingLineKey,
        revealSetKey: decorations.revealSetKey,
      };
    }
    if (
      transaction.docChanged ||
      transaction.reconfigured ||
      focused !== decorations.focused ||
      inputComposing !== decorations.inputComposing ||
      composingLineKey !== decorations.composingLineKey ||
      revealSetKey !== decorations.revealSetKey
    ) {
      return buildMarkdownDecorations(transaction.state, focused, inputComposing);
    }
    return {
      decorations: decorations.decorations.map(transaction.changes),
      atomicRanges: decorations.atomicRanges.map(transaction.changes),
      focused,
      inputComposing,
      composingLineKey,
      revealSetKey,
    };
  },
  provide(field) {
    return [
      EditorView.decorations.from(field, (value) => value.decorations),
      EditorView.atomicRanges.of((view) => view.state.field(field).atomicRanges),
    ];
  },
});

const markdownLivePreviewFocusEffect = StateEffect.define<boolean>();

const markdownLivePreviewFocusExtension = EditorView.focusChangeEffect.of((_state, focusing) => (
  markdownLivePreviewFocusEffect.of(focusing)
));

function getLivePreviewFocusState(focused: boolean, effects: readonly StateEffect<unknown>[]): boolean {
  for (const effect of effects) {
    if (effect.is(markdownLivePreviewFocusEffect)) return effect.value;
  }
  return focused;
}

function getLivePreviewRevealSetKey(state: EditorState, focused: boolean): string {
  const inlineRevealRange = getLivePreviewInlineRevealRange(state, focused);
  return inlineRevealRange ? `${inlineRevealRange.from}:${inlineRevealRange.to}` : "";
}

function getLivePreviewInlineRevealRange(state: EditorState, focused: boolean): InlineRevealRange | null {
  if (!focused || state.readOnly || state.selection.ranges.length !== 1) return null;

  const selection = state.selection.main;
  if (!selection.empty) return null;

  const element = getInlineRevealElement(state, selection.from);
  return element ? { from: element.from, to: element.to } : null;
}

function buildMarkdownDecorations(state: EditorState, focused: boolean, inputComposing: boolean): LivePreviewDecorations {
  const builders: MarkdownDecorationBuilders = {
    decorations: [],
    atomicRanges: [],
  };
  const inlineRevealRange = getLivePreviewInlineRevealRange(state, focused);
  const composingLine = state.field(markdownComposingBlockLineField, false) ?? null;
  const expandedImageRange = state.field(markdownExpandedImageField, false) ?? null;

  addMarkdownBlockAndLineDecorations(
    state,
    builders,
    inlineRevealRange,
    expandedImageRange,
    composingLine,
    state.facet(markdownHtmlTrustModeFacet),
    state.facet(markdownLinkGraphFacet),
    state.facet(markdownDocumentPathFacet),
    state.facet(markdownAssetUrlResolverFacet),
  );

  return {
    decorations: builders.decorations.length > 0 ? Decoration.set(builders.decorations, true) : Decoration.none,
    atomicRanges: builders.atomicRanges.length > 0 ? Decoration.set(builders.atomicRanges, true) : Decoration.none,
    focused,
    inputComposing,
    composingLineKey: composingLine ? `${composingLine.from}:${composingLine.to}` : "",
    revealSetKey: inlineRevealRange ? `${inlineRevealRange.from}:${inlineRevealRange.to}` : "",
  };
}

function addMarkdownBlockAndLineDecorations(
  state: EditorState,
  builders: MarkdownDecorationBuilders,
  inlineRevealRange: InlineRevealRange | null,
  expandedImageRange: ExpandedImageRange | null,
  composingLine: ComposingBlockLine | null,
  htmlTrustMode: MarkdownHtmlTrustMode,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
) {
  const lineCount = state.doc.lines;

  for (let lineNumber = 1; lineNumber <= lineCount;) {
    const line = state.doc.line(lineNumber);
    if (composingLine?.from === line.from) {
      builders.decorations.push(
        Decoration.line({
          class: "cm-md-source-line",
        }).range(line.from),
      );
      lineNumber += 1;
      continue;
    }

    const codeBlock = getMarkdownCodeBlock(state, line.number);
    if (codeBlock) {
      addReplacementDecoration(
        builders,
        Decoration.replace({
          widget: new CodeBlockWidget(codeBlock.code, codeBlock.language, codeBlock.from, codeBlock.to),
          block: true,
        }),
        codeBlock.from,
        codeBlock.to,
      );
      lineNumber = codeBlock.nextLineNumber;
      continue;
    }

    const htmlBlock = getMarkdownHtmlBlock(state, line.number);
    if (htmlBlock) {
      addReplacementDecoration(
        builders,
        Decoration.replace({
          widget: new HtmlBlockWidget(htmlBlock, htmlTrustMode, documentPath, markdownAssetUrlResolver),
          block: true,
        }),
        htmlBlock.from,
        htmlBlock.to,
      );
      lineNumber = htmlBlock.nextLineNumber;
      continue;
    }

    const tableBlock = getMarkdownTableBlock(state, line.number);
    if (tableBlock) {
      addReplacementDecoration(
        builders,
        Decoration.replace({
          widget: new MarkdownTableWidget(
            tableBlock.from,
            tableBlock.to,
            tableBlock.rows,
            markdownLinkGraph,
            documentPath,
            markdownAssetUrlResolver,
          ),
          block: true,
        }),
        tableBlock.from,
        tableBlock.to,
      );
      lineNumber = tableBlock.nextLineNumber;
      continue;
    }

    decorateMarkdownLine(
      line.from,
      line.to,
      line.text,
      builders,
      inlineRevealRange,
      expandedImageRange,
      markdownLinkGraph,
      documentPath,
      markdownAssetUrlResolver,
    );
    lineNumber += 1;
  }
}

function decorateMarkdownLine(
  lineFrom: number,
  lineTo: number,
  text: string,
  builders: MarkdownDecorationBuilders,
  inlineRevealRange: InlineRevealRange | null,
  expandedImageRange: ExpandedImageRange | null,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
) {
  const taskLine = getMarkdownTaskLine({ from: lineFrom, to: lineTo, text });
  const listMatch = taskLine ? null : /^(\s*)([-*+]|\d+[.)])\s+/.exec(text);
  const lineClasses = getMarkdownLineClasses(text);
  if (lineClasses) {
    builders.decorations.push(
      Decoration.line({
        class: lineClasses,
        attributes: getMarkdownLineAttributes(taskLine, listMatch),
      }).range(lineFrom),
    );
  }

  const hrMatch = /^(\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*)$/.exec(text);
  if (hrMatch && lineFrom < lineTo) {
    addReplacementDecoration(
      builders,
      Decoration.replace({
        widget: new HorizontalRuleWidget(),
        inclusive: false,
      }),
      lineFrom,
      lineFrom + hrMatch[1].length,
    );
    return;
  }

  const headingMatch = /^(#{1,6})(\s|$)/.exec(text);
  if (headingMatch) {
    addSourceSyntaxDecoration(builders, lineFrom, lineFrom + headingMatch[0].length, "heading", false);
  }

  const blockquoteMarker = /^(\s*>\s?)/.exec(text);
  if (blockquoteMarker) {
    addSourceSyntaxDecoration(builders, lineFrom, lineFrom + blockquoteMarker[1].length, "blockquote", false);
  }

  if (taskLine) {
    addSourceSyntaxDecoration(builders, taskLine.prefixFrom, taskLine.prefixTo, "task", false);
    builders.decorations.push(
      Decoration.widget({
        widget: new TaskCheckboxWidget(taskLine),
        side: -1,
      }).range(taskLine.prefixTo),
    );
    addInlineMarkdownDecorations(
      lineFrom,
      text,
      builders,
      inlineRevealRange,
      expandedImageRange,
      markdownLinkGraph,
      documentPath,
      markdownAssetUrlResolver,
      [{ from: taskLine.prefixFrom, to: taskLine.prefixTo }],
    );
    return;
  }

  if (listMatch) {
    addSourceSyntaxDecoration(builders, lineFrom, lineFrom + listMatch[0].length, "list", false);
  }

  addInlineMarkdownDecorations(
    lineFrom,
    text,
    builders,
    inlineRevealRange,
    expandedImageRange,
    markdownLinkGraph,
    documentPath,
    markdownAssetUrlResolver,
  );
}

function getMarkdownLineAttributes(
  taskLine: MarkdownTaskLine | null,
  listMatch: RegExpExecArray | null,
): Record<string, string> | undefined {
  if (taskLine) return { style: `--md-list-depth:${taskLine.depth};` };
  if (!listMatch) return undefined;

  const marker = cssString(getListMarkerText(listMatch[2]));
  const depth = getListDepth(listMatch[1]);
  return { style: `--md-list-depth:${depth};--md-list-marker:${marker};` };
}

function cssString(value: string): string {
  return JSON.stringify(value);
}

function getMarkdownLineClasses(text: string): string {
  const classes: string[] = [];

  const headingMatch = /^(#{1,6})(?:\s|$)/.exec(text);
  if (headingMatch) {
    classes.push("cm-md-heading", `cm-md-heading-${headingMatch[1].length}`);
  }

  if (/^\s*>/.test(text)) classes.push("cm-md-blockquote");
  if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(text)) classes.push("cm-md-list-line");
  if (/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(text)) classes.push("cm-md-task-line");
  if (/^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]/.test(text)) classes.push("cm-md-task-checked");
  if (/^\s*(`{3,}|~{3,})/.test(text)) classes.push("cm-md-code-fence");
  if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(text)) classes.push("cm-md-hr");
  if (isMarkdownTableLine(text)) classes.push("cm-md-table-line");

  return classes.join(" ");
}

function addInlineMarkdownDecorations(
  lineFrom: number,
  text: string,
  builders: MarkdownDecorationBuilders,
  inlineRevealRange: InlineRevealRange | null,
  expandedImageRange: ExpandedImageRange | null,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
  initialOccupied: OccupiedRange[] = [],
) {
  const occupied = [...initialOccupied];

  addDelimiterDecorations(lineFrom, text, /(`)([^`\n]+)(`)/g, 1, "cm-md-syntax-monospace", builders, occupied, inlineRevealRange);
  addImageDecorations(lineFrom, text, builders, occupied, expandedImageRange, documentPath, markdownAssetUrlResolver);
  addWikiLinkDecorations(lineFrom, text, builders, occupied, inlineRevealRange, markdownLinkGraph, documentPath);
  addLinkDecorations(lineFrom, text, builders, occupied, inlineRevealRange, markdownLinkGraph, documentPath);
  addDelimiterDecorations(
    lineFrom,
    text,
    /(\*\*|__)(\S(?:.*?\S)?)\1/g,
    1,
    "cm-md-syntax-strong",
    builders,
    occupied,
    inlineRevealRange,
  );
  addDelimiterDecorations(
    lineFrom,
    text,
    /(~~)(\S(?:.*?\S)?)(~~)/g,
    1,
    "cm-md-syntax-strikethrough",
    builders,
    occupied,
    inlineRevealRange,
  );
  addItalicDecorations(lineFrom, text, builders, occupied, inlineRevealRange);
}

function addImageDecorations(
  lineFrom: number,
  text: string,
  builders: MarkdownDecorationBuilders,
  occupied: OccupiedRange[],
  expandedImageRange: ExpandedImageRange | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
) {
  for (const token of findMarkdownImageTokens(text)) {
    const matchFrom = lineFrom + token.from;
    const matchTo = lineFrom + token.to;
    if (!reserveRange(occupied, matchFrom, matchTo)) continue;
    if (expandedImageRange?.from === matchFrom && expandedImageRange.to === matchTo) continue;

    addReplacementDecoration(
      builders,
      Decoration.replace({
        widget: new ImagePreviewWidget(matchFrom, matchTo, token.alt, token.href, token.title, documentPath, markdownAssetUrlResolver),
        inclusive: false,
      }),
      matchFrom,
      matchTo,
    );
  }
}

function addWikiLinkDecorations(
  lineFrom: number,
  text: string,
  builders: MarkdownDecorationBuilders,
  occupied: OccupiedRange[],
  inlineRevealRange: InlineRevealRange | null,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
) {
  for (const token of findWikiLinkTokens(text)) {
    const matchFrom = lineFrom + token.from;
    const matchTo = lineFrom + token.to;
    if (!reserveRange(occupied, matchFrom, matchTo)) continue;

    const visibleFrom = lineFrom + (token.aliasFrom ?? token.targetFrom);
    const visibleTo = lineFrom + (token.aliasTo ?? token.targetTo);
    if (visibleFrom >= visibleTo) continue;

    const resolvedTarget = markdownLinkGraph?.resolveWikiLink(documentPath, token.target) ?? null;
    const classes = [
      "cm-md-syntax-link",
      "cm-md-wiki-link-label",
      resolvedTarget?.exists ? "is-resolved" : "is-missing",
      resolvedTarget?.ambiguous ? "is-ambiguous" : "",
    ].filter(Boolean).join(" ");
    const revealSourceSyntax = isRevealedInlineRange(matchFrom, matchTo, inlineRevealRange);

    addSourceSyntaxDecoration(builders, matchFrom, visibleFrom, "wiki-link", revealSourceSyntax);
    builders.decorations.push(
      Decoration.mark({
        class: classes,
        attributes: {
          "data-wiki-target": token.target,
          role: "link",
          tabindex: "0",
          "aria-label": getWikiLinkTitle(resolvedTarget, token.target),
        },
      }).range(visibleFrom, visibleTo),
    );
    addSourceSyntaxDecoration(builders, visibleTo, matchTo, "wiki-link", revealSourceSyntax);
  }
}

function addLinkDecorations(
  lineFrom: number,
  text: string,
  builders: MarkdownDecorationBuilders,
  occupied: OccupiedRange[],
  inlineRevealRange: InlineRevealRange | null,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
) {
  for (const token of findMarkdownLinkTokens(text)) {
    const matchFrom = lineFrom + token.from;
    const labelFrom = lineFrom + token.labelFrom;
    const labelTo = lineFrom + token.labelTo;
    const matchTo = lineFrom + token.to;
    if (!reserveRange(occupied, matchFrom, matchTo)) continue;

    const resolvedTarget = markdownLinkGraph?.resolveMarkdownLink(documentPath, token.href) ?? null;
    const linkClasses = [
      "cm-md-syntax-link",
      "cm-md-link-label",
      resolvedTarget ? "cm-md-document-link-label" : "",
      resolvedTarget?.exists ? "is-resolved" : "",
      resolvedTarget && !resolvedTarget.exists ? "is-missing" : "",
      resolvedTarget?.ambiguous ? "is-ambiguous" : "",
      isExternalMarkdownHref(token.href) && isSafeHref(token.href) ? "is-external" : "",
    ].filter(Boolean).join(" ");
    const revealSourceSyntax = isRevealedInlineRange(matchFrom, matchTo, inlineRevealRange);

    addSourceSyntaxDecoration(builders, matchFrom, labelFrom, "link", revealSourceSyntax);
    builders.decorations.push(
      Decoration.mark({
        class: linkClasses,
        attributes: {
          "data-md-href": token.href,
          role: "link",
          tabindex: "0",
          "aria-label": getMarkdownLinkTitle(resolvedTarget, token.href),
        },
      }).range(labelFrom, labelTo),
    );
    addSourceSyntaxDecoration(builders, labelTo, matchTo, "link", revealSourceSyntax);
  }
}

function getWikiLinkTitle(
  resolvedTarget: ReturnType<MarkdownLinkGraph["resolveWikiLink"]> | null,
  target: string,
): string {
  if (!resolvedTarget) return target;
  if (!resolvedTarget.exists) return `Missing linked note: ${target}`;
  if (resolvedTarget.ambiguous) return `${resolvedTarget.path} (ambiguous title match)`;
  return resolvedTarget.path ?? target;
}

function getMarkdownLinkTitle(
  resolvedTarget: ReturnType<MarkdownLinkGraph["resolveMarkdownLink"]> | null,
  href: string,
): string {
  if (!resolvedTarget) return href;
  if (!resolvedTarget.exists) return `Missing linked note: ${href}`;
  if (resolvedTarget.ambiguous) return `${resolvedTarget.path} (ambiguous title match)`;
  return resolvedTarget.path ?? href;
}

function addDelimiterDecorations(
  lineFrom: number,
  text: string,
  pattern: RegExp,
  delimiterGroupIndex: number,
  contentClass: string,
  builders: MarkdownDecorationBuilders,
  occupied: OccupiedRange[],
  inlineRevealRange: InlineRevealRange | null,
) {
  for (const match of text.matchAll(pattern)) {
    if (match.index == null) continue;
    const delimiter = match[delimiterGroupIndex];
    const content = match[delimiterGroupIndex + 1];
    if (!delimiter || !content?.trim()) continue;

    const matchFrom = lineFrom + match.index;
    const openingTo = matchFrom + delimiter.length;
    const contentTo = openingTo + content.length;
    const closingTo = matchFrom + match[0].length;
    if (!reserveRange(occupied, matchFrom, closingTo)) continue;
    const revealSourceSyntax = isRevealedInlineRange(matchFrom, closingTo, inlineRevealRange);

    addSourceSyntaxDecoration(builders, matchFrom, openingTo, "delimiter", revealSourceSyntax);
    builders.decorations.push(Decoration.mark({ class: contentClass }).range(openingTo, contentTo));
    addSourceSyntaxDecoration(builders, contentTo, closingTo, "delimiter", revealSourceSyntax);
  }
}

function addItalicDecorations(
  lineFrom: number,
  text: string,
  builders: MarkdownDecorationBuilders,
  occupied: OccupiedRange[],
  inlineRevealRange: InlineRevealRange | null,
) {
  const pattern = /(^|[^\*])(\*)([^\s*](?:.*?[^\s*])?)(\*)(?!\*)/g;

  for (const match of text.matchAll(pattern)) {
    if (match.index == null) continue;
    const prefixLength = match[1].length;
    const content = match[3];
    if (!content?.trim()) continue;

    const openingFrom = lineFrom + match.index + prefixLength;
    const contentFrom = openingFrom + 1;
    const contentTo = contentFrom + content.length;
    const closingTo = contentTo + 1;
    if (!reserveRange(occupied, openingFrom, closingTo)) continue;
    const revealSourceSyntax = isRevealedInlineRange(openingFrom, closingTo, inlineRevealRange);

    addSourceSyntaxDecoration(builders, openingFrom, contentFrom, "delimiter", revealSourceSyntax);
    builders.decorations.push(Decoration.mark({ class: "cm-md-syntax-emphasis" }).range(contentFrom, contentTo));
    addSourceSyntaxDecoration(builders, contentTo, closingTo, "delimiter", revealSourceSyntax);
  }
}

function addSourceSyntaxDecoration(
  builders: MarkdownDecorationBuilders,
  from: number,
  to: number,
  kind: MarkdownSourceSyntaxKind,
  revealSourceSyntax: boolean,
) {
  if (from >= to) return;
  if (revealSourceSyntax) {
    builders.decorations.push(
      Decoration.mark({
        class: `cm-md-source-syntax cm-md-source-syntax-${kind}`,
        inclusive: false,
      }).range(from, to),
    );
    return;
  }

  addReplacementDecoration(
    builders,
    Decoration.replace({
      widget: new HiddenMarkdownSyntaxWidget(kind),
      inclusive: false,
    }),
    from,
    to,
  );
}

function isRevealedInlineRange(from: number, to: number, inlineRevealRange: InlineRevealRange | null): boolean {
  return inlineRevealRange?.from === from && inlineRevealRange.to === to;
}

function addReplacementDecoration(
  builders: MarkdownDecorationBuilders,
  decoration: Decoration,
  from: number,
  to: number,
  options: { atomic?: boolean } = {},
) {
  if (from >= to) return;
  const range = decoration.range(from, to);
  builders.decorations.push(range);
  if (options.atomic !== false) builders.atomicRanges.push(range);
}

function reserveRange(occupied: OccupiedRange[], from: number, to: number): boolean {
  if (from >= to) return false;
  if (occupied.some((range) => from < range.to && to > range.from)) return false;
  occupied.push({ from, to });
  return true;
}

function getListMarkerText(marker: string): string {
  if (/^\d+[.)]$/.test(marker)) return marker;
  return "\u2022";
}

function getListDepth(leadingWhitespace: string): number {
  return Math.floor(leadingWhitespace.replace(/\t/g, "    ").length / 2);
}

function getMarkdownCodeBlock(state: EditorState, lineNumber: number): MarkdownCodeBlock | null {
  const doc = state.doc;
  const openingLine = doc.line(lineNumber);
  const openingMatch = /^(\s*)(`{3,}|~{3,})([^\n`]*)$/.exec(openingLine.text);
  if (!openingMatch) return null;

  const fence = openingMatch[2];
  const fenceCharacter = fence[0];
  const minimumFenceLength = fence.length;
  const language = openingMatch[3].trim().split(/\s+/)[0] ?? "";
  const codeLines: string[] = [];
  let closingLine = openingLine;
  let nextLineNumber = lineNumber + 1;

  while (nextLineNumber <= doc.lines) {
    const line = doc.line(nextLineNumber);
    const closingPattern = new RegExp(`^\\s*\\${fenceCharacter}{${minimumFenceLength},}\\s*$`);
    if (closingPattern.test(line.text)) {
      closingLine = line;
      nextLineNumber += 1;
      break;
    }

    codeLines.push(line.text);
    closingLine = line;
    nextLineNumber += 1;
  }

  return {
    from: openingLine.from,
    to: closingLine.to,
    nextLineNumber,
    language,
    code: codeLines.join("\n"),
  };
}
