import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  placeholder as placeholderExtension,
  type DecorationSet,
} from "@codemirror/view";
import type { AgentDraftReference, AgentPromptReferenceMention } from "../../domain/agent-contract";
import {
  agentPromptMentionText,
  isAgentMediaReference,
  normalizeAgentPromptMentions,
} from "../../domain/agent-prompt-mentions";

type AgentPromptEditorProps = {
  value: string;
  mentions: AgentPromptReferenceMention[];
  references: AgentDraftReference[];
  disabled: boolean;
  placeholder: string;
  ariaLabel: string;
  onChange: (value: string, mentions: AgentPromptReferenceMention[]) => void;
  onRemoveReference?: (id: string) => void;
  onPaste?: (event: { clipboardData: DataTransfer; preventDefault: () => void; defaultPrevented: boolean }) => void;
  onSubmit: () => void;
};

const replaceMentionDecorations = StateEffect.define<AgentPromptReferenceMention[]>();
const mentionDecorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(replaceMentionDecorations)) continue;
      next = Decoration.set(effect.value.map((mention) => Decoration.mark({
        class: "desktop-agent-prompt-mention",
        attributes: { "data-reference-id": mention.referenceId },
      }).range(mention.start, mention.end)), true);
    }
    return next;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

/**
 * A small structured editor: plain prompt text plus atomic reference ranges.
 * CodeMirror owns selection, IME, undo and drag-position behavior; the app owns
 * semantic reference ids and never encodes authorization into DOM text.
 */
export function AgentPromptEditor({
  value,
  mentions,
  references,
  disabled,
  placeholder,
  ariaLabel,
  onChange,
  onRemoveReference,
  onPaste,
  onSubmit,
}: AgentPromptEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartmentRef = useRef(new Compartment());
  const placeholderCompartmentRef = useRef(new Compartment());
  const callbacksRef = useRef({ onChange, onRemoveReference, onPaste, onSubmit });
  callbacksRef.current = { onChange, onRemoveReference, onPaste, onSubmit };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        mentionDecorations,
        history(),
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
        editableCompartmentRef.current.of(EditorView.editable.of(!disabled)),
        EditorView.contentAttributes.of({ "aria-label": ariaLabel, role: "textbox", "aria-multiline": "true" }),
        placeholderCompartmentRef.current.of(placeholderExtension(placeholder)),
        Prec.high(keymap.of([{
          key: "Enter",
          run: (view) => {
            if (view.composing) return false;
            callbacksRef.current.onSubmit();
            return true;
          },
          shift: () => false,
        }])),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.domEventHandlers({
          paste: (event) => {
            if (event.clipboardData) callbacksRef.current.onPaste?.({
              clipboardData: event.clipboardData,
              preventDefault: () => event.preventDefault(),
              defaultPrevented: event.defaultPrevented,
            });
            return event.defaultPrevented;
          },
          dragover: (event, view) => {
            const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (position !== null) view.dispatch({ selection: { anchor: position } });
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const nextMentions = readMentions(update.state);
          const previousIds = new Set(readMentions(update.startState).map((mention) => mention.referenceId));
          const nextIds = new Set(nextMentions.map((mention) => mention.referenceId));
          for (const id of previousIds) if (!nextIds.has(id)) callbacksRef.current.onRemoveReference?.(id);
          callbacksRef.current.onChange(update.state.doc.toString(), nextMentions);
        }),
      ],
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    view.dispatch({ effects: replaceMentionDecorations.of(normalizeAgentPromptMentions(value, mentions)) });
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  // The editor instance is deliberately stable; controlled changes are synced below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    const normalized = normalizeAgentPromptMentions(value, mentions);
    if (current === value && sameMentions(readMentions(view.state), normalized)) return;
    view.dispatch({
      ...(current === value ? {} : { changes: { from: 0, to: current.length, insert: value } }),
      effects: replaceMentionDecorations.of(normalized),
    });
  }, [mentions, value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: editableCompartmentRef.current.reconfigure(EditorView.editable.of(!disabled)) });
    view.contentDOM.setAttribute("aria-label", ariaLabel);
    view.contentDOM.setAttribute("aria-disabled", disabled ? "true" : "false");
  }, [ariaLabel, disabled]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: placeholderCompartmentRef.current.reconfigure(placeholderExtension(placeholder)) });
  }, [placeholder]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || disabled) return;
    const existing = new Set(readMentions(view.state).map((mention) => mention.referenceId));
    const insertions = references.filter((reference) => (
      reference.status === "ready" && !isAgentMediaReference(reference) && !existing.has(reference.id)
    ));
    if (insertions.length === 0) return;

    const position = view.state.selection.main.head;
    const document = view.state.doc.toString();
    const prefix = position > 0 && !/\s/.test(document[position - 1] ?? "") ? " " : "";
    let inserted = prefix;
    const added: AgentPromptReferenceMention[] = [];
    for (const [index, reference] of insertions.entries()) {
      if (index > 0) inserted += " ";
      const start = position + inserted.length;
      inserted += agentPromptMentionText(reference);
      added.push({ referenceId: reference.id, start, end: position + inserted.length });
    }
    inserted += position < document.length && !/\s/.test(document[position] ?? "") ? " " : "";
    const transaction = view.state.update({
      changes: { from: position, insert: inserted },
      selection: { anchor: position + inserted.length },
    });
    const mapped = readMentions(view.state).map((mention) => ({
      ...mention,
      start: transaction.changes.mapPos(mention.start, 1),
      end: transaction.changes.mapPos(mention.end, -1),
    }));
    view.dispatch({
      changes: { from: position, insert: inserted },
      selection: { anchor: position + inserted.length },
      effects: replaceMentionDecorations.of([...mapped, ...added].sort((left, right) => left.start - right.start)),
    });
    view.focus();
  }, [disabled, references]);

  return <div ref={hostRef} className="desktop-agent-prompt-editor" dir="auto" />;
}

function readMentions(state: EditorState) {
  const mentions: AgentPromptReferenceMention[] = [];
  state.field(mentionDecorations).between(0, state.doc.length, (start, end, decoration) => {
    const referenceId = decoration.spec.attributes?.["data-reference-id"];
    if (typeof referenceId === "string") mentions.push({ referenceId, start, end });
  });
  return mentions;
}

function sameMentions(left: readonly AgentPromptReferenceMention[], right: readonly AgentPromptReferenceMention[]) {
  return left.length === right.length && left.every((mention, index) => (
    mention.referenceId === right[index]?.referenceId
    && mention.start === right[index]?.start
    && mention.end === right[index]?.end
  ));
}
