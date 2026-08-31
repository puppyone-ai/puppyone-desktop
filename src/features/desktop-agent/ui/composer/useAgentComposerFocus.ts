import { useCallback, useRef, type MouseEvent } from "react";
import type { AgentPromptEditorHandle } from "./AgentPromptEditor";

const COMPOSER_CONTROL_SELECTOR = "button, a[href], input, select, [role='button'], [role='option']";
const PROMPT_EDITOR_SELECTOR = ".desktop-agent-prompt-editor-host";
const PROMPT_EDITOR_CONTENT_SELECTOR = ".cm-content";

/** Routes pointer intent without exposing CodeMirror's DOM to the Composer. */
export function useAgentComposerFocus(inputDisabled: boolean) {
  const promptEditorRef = useRef<AgentPromptEditorHandle>(null);
  const handleSurfaceMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (inputDisabled || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const promptEditorBoundary = target.closest(PROMPT_EDITOR_SELECTOR);
    if (promptEditorBoundary) {
      // Text, mentions and selections remain native CodeMirror interactions.
      if (target.closest(PROMPT_EDITOR_CONTENT_SELECTOR)) return;
      // The content node does not always cover CodeMirror's scrollable chrome.
      promptEditorRef.current?.focusAtCoordinates({ x: event.clientX, y: event.clientY });
      return;
    }
    if (target.closest(COMPOSER_CONTROL_SELECTOR)) return;

    event.preventDefault();
    promptEditorRef.current?.focusAtEnd();
  }, [inputDisabled]);

  return { promptEditorRef, handleSurfaceMouseDown };
}
