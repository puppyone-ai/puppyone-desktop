export type SourceRange = {
  from: number;
  to: number;
};

export type MarkdownDiagnostic = {
  code: string;
  message: string;
};

export type InlineMarkCapabilities = {
  reveal: boolean;
  atomic: boolean;
  deleteUnits: readonly SourceRange[];
};

export type AtomicInlineCapabilities = {
  reveal: boolean;
  atomic: true;
  deleteUnits: readonly SourceRange[];
  expand: boolean;
};

export type BlockEmbedCapabilities = {
  reveal: false;
  atomic: true;
  deleteUnits: readonly [];
};

export type TypedContentMark = {
  kind: "inlineHtmlMark" | "strong" | "emphasis" | "strike" | "inlineCode" | "link" | "wikiLink";
  tagName?: string;
  className?: string;
  attributes: Readonly<Record<string, string>>;
};

export type InlineAtomModel =
  | { kind: "lineBreak" }
  | { kind: "image"; alt: string; href: string; title: string | null }
  | { kind: "escape" };

export type BlockEmbedModel =
  | { kind: "codeBlock"; language: string; code: string }
  | { kind: "mermaid"; language: string; code: string }
  | { kind: "table" }
  | { kind: "htmlBlock"; tagName: string | null; closed: boolean; source: string }
  | { kind: "horizontalRule" }
  | { kind: "taskCheckbox"; checked: boolean };

export type MarkdownElementPlan =
  | {
      presentation: "visibleSource";
      sourceRange: SourceRange;
      diagnostics: readonly MarkdownDiagnostic[];
      capabilities: { reveal: false; atomic: false; deleteUnits: readonly [] };
    }
  | {
      presentation: "inlineMark";
      sourceRange: SourceRange;
      contentRange: SourceRange;
      markerRanges: readonly SourceRange[];
      mark: TypedContentMark;
      diagnostics: readonly MarkdownDiagnostic[];
      capabilities: InlineMarkCapabilities;
    }
  | {
      presentation: "inlineAtom";
      sourceRange: SourceRange;
      atom: InlineAtomModel;
      layout: { lineBreaks: number; estimatedHeight?: number };
      diagnostics: readonly MarkdownDiagnostic[];
      capabilities: AtomicInlineCapabilities;
    }
  | {
      presentation: "blockAtom";
      sourceRange: SourceRange;
      embed: BlockEmbedModel;
      layout: { estimatedHeight: number };
      diagnostics: readonly MarkdownDiagnostic[];
      capabilities: BlockEmbedCapabilities;
    };

export function planHasCollapsedMarkerDeletion(plan: MarkdownElementPlan): boolean {
  return plan.capabilities.deleteUnits.length > 0;
}

export function planSupportsReveal(plan: MarkdownElementPlan): boolean {
  return plan.capabilities.reveal;
}
