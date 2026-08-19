/**
 * Mouse-link de-duplication owned by one Markdown EditorView.
 *
 * Chromium emits a click after a handled mousedown. Keeping this deadline in
 * an instance session prevents one pane from consuming a sibling pane's click.
 */
export class MarkdownLinkInteractionSession {
  private suppressNextMouseLinkClickUntil = 0;

  recordHandledMouseDown(now = Date.now()) {
    this.suppressNextMouseLinkClickUntil = now + 700;
  }

  consumeDuplicateClick(now = Date.now()): boolean {
    if (this.suppressNextMouseLinkClickUntil < now) return false;
    this.suppressNextMouseLinkClickUntil = 0;
    return true;
  }
}
