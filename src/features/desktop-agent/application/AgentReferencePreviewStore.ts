export type AgentReferenceVisualPreview = Readonly<{
  url: string;
  release?: () => void;
}>;

/**
 * Renderer-only visual assets for Composer references.
 *
 * Preview URLs deliberately stay outside AgentDraftReference so they are never
 * persisted, cloned into queued intents, or sent across the Agent IPC boundary.
 */
export class AgentReferencePreviewStore {
  private readonly entries = new Map<string, AgentReferenceVisualPreview>();

  getUrl(id: string) {
    return this.entries.get(id)?.url ?? null;
  }

  set(id: string, preview: AgentReferenceVisualPreview | null | undefined) {
    if (!preview?.url) return;
    const previous = this.entries.get(id);
    if (previous?.url === preview.url) return;
    this.release(previous);
    this.entries.set(id, preview);
  }

  move(sourceId: string, targetId: string) {
    const preview = this.entries.get(sourceId);
    if (!preview) return;
    this.entries.delete(sourceId);
    this.set(targetId, preview);
  }

  delete(id: string) {
    const preview = this.entries.get(id);
    this.entries.delete(id);
    this.release(preview);
  }

  deleteMany(ids: Iterable<string>) {
    for (const id of new Set(ids)) this.delete(id);
  }

  clear() {
    this.deleteMany(this.entries.keys());
  }

  private release(preview: AgentReferenceVisualPreview | undefined) {
    try {
      preview?.release?.();
    } catch {
      // Preview cleanup is best-effort and must never disrupt draft state.
    }
  }
}

export function createAgentFileVisualPreview(file: File): AgentReferenceVisualPreview | null {
  if (!isPreviewableRasterImage(file)) return null;
  if (typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") return null;
  try {
    const url = URL.createObjectURL(file);
    return { url, release: () => URL.revokeObjectURL(url) };
  } catch {
    return null;
  }
}

function isPreviewableRasterImage(file: File) {
  if (["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"].includes(file.type)) return true;
  return /\.(?:png|jpe?g|gif|webp|avif)$/i.test(file.name);
}
