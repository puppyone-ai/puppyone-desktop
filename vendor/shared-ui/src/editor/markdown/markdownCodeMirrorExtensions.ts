import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import {
  EditorView,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  placeholder,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { markdownLivePreviewDecorations } from "./decorations/livePreviewDecorations";
import { markdownBlockWidgetSelectionExtension } from "./widgets/blockWidgetSelection";
import { markdownEditingKeymap } from "./keymap/markdownEditingKeymap";
import { markdownLivePreviewContextExtension } from "./markdownLivePreviewContext";
import { markdownComposingBlockLineField, markdownInputCompositionExtension } from "./state/composingBlockLine";
import { markdownExpandedImageField } from "./state/expandedImage";
import { markdownLivePreviewFocusExtension } from "./state/livePreviewFocus";
import {
  markdownHiddenMarkerSelectionNormalizer,
  trailingLineWhitespaceSelectionExtension,
} from "./state/selectionBehavior";
import { puppyMarkdownParserExtensions } from "./syntax/markdownParserExtensions";
import type { MarkdownAssetUrlResolver, MarkdownHtmlTrustMode, MarkdownLinkGraph } from "../viewerTypes";

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
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
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
    keymap.of([...markdownEditingKeymap]),
    markdownLivePreviewContextExtension(htmlTrustMode, markdownLinkGraph, documentPath, markdownAssetUrlResolver),
    markdownHiddenMarkerSelectionNormalizer,
    markdownLivePreviewFocusExtension,
    markdownInputCompositionExtension,
    markdownComposingBlockLineField,
    markdownExpandedImageField,
    markdownLivePreviewDecorations,
    markdownBlockWidgetSelectionExtension,
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
    // Vertical block spacing token; 0 in source mode, opened up by
    // markdown-editor.css in live preview (see "Vertical rhythm" note).
    padding: "var(--po-markdown-editor-line-spacing, 0px) 0",
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
