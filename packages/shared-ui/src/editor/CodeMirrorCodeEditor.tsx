"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useEffect, useMemo, useRef } from "react";

export type CodeMirrorCodeEditorProps = {
  content: string;
  nodeName?: string;
  language?: string | null;
  readOnly?: boolean;
  onChange?: (content: string) => void;
};

export function CodeMirrorCodeEditor({
  content,
  nodeName = "",
  language = null,
  readOnly = true,
  onChange,
}: CodeMirrorCodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageCompartmentRef = useRef(new Compartment());
  const readOnlyCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);
  const applyingExternalChangeRef = useRef(false);
  const languageKey = useMemo(() => getCodeLanguageKey(language, nodeName), [language, nodeName]);
  const initialEditorConfigRef = useRef({ content, languageKey, nodeName, readOnly });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const initialConfig = initialEditorConfigRef.current;

    const state = EditorState.create({
      doc: initialConfig.content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || readOnlyRef.current || applyingExternalChangeRef.current) return;
          onChangeRef.current?.(update.state.doc.toString());
        }),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": { overflow: "auto" },
        }),
        languageCompartmentRef.current.of(getCodeLanguageExtension(initialConfig.languageKey, initialConfig.nodeName)),
        readOnlyCompartmentRef.current.of(getReadOnlyExtension(initialConfig.readOnly)),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const current = view.state.doc.toString();
    if (current === content) return;

    applyingExternalChangeRef.current = true;
    try {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: content,
        },
      });
    } finally {
      applyingExternalChangeRef.current = false;
    }
  }, [content]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: readOnlyCompartmentRef.current.reconfigure(getReadOnlyExtension(readOnly)),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: languageCompartmentRef.current.reconfigure(getCodeLanguageExtension(languageKey, nodeName)),
    });
  }, [languageKey, nodeName]);

  return (
    <div className="code-codemirror-editor" data-language={languageKey || "plaintext"}>
      <div ref={hostRef} className="code-codemirror-editor__host" />
    </div>
  );
}

function getReadOnlyExtension(readOnly: boolean): Extension {
  return [
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
  ];
}

function getCodeLanguageExtension(languageKey: string, nodeName: string): Extension {
  switch (languageKey) {
    case "javascript":
    case "jsx":
      return javascript({ jsx: languageKey === "jsx" || /\.jsx$/i.test(nodeName) });
    case "typescript":
    case "tsx":
      return javascript({
        typescript: true,
        jsx: languageKey === "tsx" || /\.tsx$/i.test(nodeName),
      });
    case "html":
    case "xml":
      return html();
    case "css":
    case "scss":
    case "less":
      return css();
    case "json":
      return javascript();
    default:
      return [];
  }
}

function getCodeLanguageKey(language: string | null | undefined, nodeName: string): string {
  const normalizedLanguage = normalizeLanguage(language);
  if (normalizedLanguage) return normalizedLanguage;

  const lowerName = nodeName.toLowerCase();
  if (lowerName.endsWith(".tsx")) return "tsx";
  if (lowerName.endsWith(".ts")) return "typescript";
  if (lowerName.endsWith(".jsx")) return "jsx";
  if (lowerName.endsWith(".js") || lowerName.endsWith(".mjs") || lowerName.endsWith(".cjs")) return "javascript";
  if (lowerName.endsWith(".css")) return "css";
  if (lowerName.endsWith(".scss") || lowerName.endsWith(".sass")) return "scss";
  if (lowerName.endsWith(".less")) return "less";
  if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) return "html";
  if (lowerName.endsWith(".xml") || lowerName.endsWith(".svg")) return "xml";
  if (lowerName.endsWith(".json") || lowerName.endsWith(".jsonl")) return "json";
  return "plaintext";
}

function normalizeLanguage(language: string | null | undefined): string | null {
  const value = language?.trim().toLowerCase();
  if (!value) return null;
  if (value === "js") return "javascript";
  if (value === "ts") return "typescript";
  if (value === "shell" || value === "bash" || value === "zsh" || value === "sh") return "plaintext";
  return value;
}
