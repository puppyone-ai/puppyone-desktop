import {
  MARKDOWN_FORMAT_ACTIVE_EVENT,
  MARKDOWN_FORMAT_SHORTCUT_EVENT,
  MARKDOWN_EDITOR_COMMAND_EVENT,
  isMarkdownEditorCommand,
  isMarkdownFormatCommand,
} from "@puppyone/shared-ui";

export function startMarkdownFormatShortcutBridge(): () => void {
  const onActive = (event: Event) => {
    const active = event instanceof CustomEvent && event.detail?.active === true;
    window.puppyoneDesktop?.setMarkdownFormatShortcutsActive?.({ active });
  };
  window.addEventListener(MARKDOWN_FORMAT_ACTIVE_EVENT, onActive);

  const stopShortcutListener = window.puppyoneDesktop?.onMarkdownFormatShortcut?.((payload) => {
    if (!isMarkdownFormatCommand(payload?.type)) return;
    window.dispatchEvent(new CustomEvent(MARKDOWN_FORMAT_SHORTCUT_EVENT, {
      detail: { type: payload.type },
    }));
  });
  const stopCommandListener = window.puppyoneDesktop?.onMarkdownEditorCommand?.((payload) => {
    if (!isMarkdownEditorCommand(payload?.type)) return;
    window.dispatchEvent(new CustomEvent(MARKDOWN_EDITOR_COMMAND_EVENT, {
      detail: { type: payload.type },
    }));
  });

  return () => {
    window.removeEventListener(MARKDOWN_FORMAT_ACTIVE_EVENT, onActive);
    stopShortcutListener?.();
    stopCommandListener?.();
    window.puppyoneDesktop?.setMarkdownFormatShortcutsActive?.({ active: false });
  };
}
