/**
 * Main-process state for one native window's ordered Workspace Folder
 * composition. The current UI replaces this composition with one Folder, but
 * authorization and ownership no longer depend on scalar root fields.
 */
export class WindowWorkspaceState {
  #initialWorkspacePaths;
  #workspaceFolders = Object.freeze([]);

  constructor({ initialWorkspacePath = null, initialWorkspacePaths = null, focusedAt = Date.now() } = {}) {
    const requestedPaths = Array.isArray(initialWorkspacePaths)
      ? initialWorkspacePaths
      : [initialWorkspacePath];
    this.#initialWorkspacePaths = Object.freeze(
      requestedPaths
        .filter((folderPath) => typeof folderPath === "string" && folderPath.trim())
        .map((folderPath) => folderPath.trim()),
    );
    this.lastFocusedAt = focusedAt;
  }

  get initialRestorePath() {
    return this.#workspaceFolders[0]?.path ?? this.#initialWorkspacePaths[0] ?? null;
  }

  get initialRestorePaths() {
    return this.#workspaceFolders.length > 0
      ? this.folderPaths
      : this.#initialWorkspacePaths;
  }

  get folders() {
    return this.#workspaceFolders;
  }

  get folderPaths() {
    return Object.freeze(this.#workspaceFolders.map((folder) => folder.path));
  }

  get primaryWorkspace() {
    return this.#workspaceFolders[0]?.workspace ?? null;
  }

  markFocused(focusedAt = Date.now()) {
    this.lastFocusedAt = focusedAt;
  }

  replaceFolders(folders) {
    const nextFolders = normalizeFolders(folders);
    const previousPaths = new Set(this.#workspaceFolders.map((folder) => folder.path));
    const nextPaths = new Set(nextFolders.map((folder) => folder.path));
    const change = Object.freeze({
      addedPaths: Object.freeze([...nextPaths].filter((folderPath) => !previousPaths.has(folderPath))),
      removedPaths: Object.freeze([...previousPaths].filter((folderPath) => !nextPaths.has(folderPath))),
      retainedPaths: Object.freeze([...nextPaths].filter((folderPath) => previousPaths.has(folderPath))),
    });
    this.#workspaceFolders = nextFolders;
    this.#initialWorkspacePaths = Object.freeze(nextFolders.map((folder) => folder.path));
    return change;
  }

  releaseFolders() {
    const released = this.#workspaceFolders;
    this.#workspaceFolders = Object.freeze([]);
    this.#initialWorkspacePaths = Object.freeze([]);
    return released;
  }
}

function normalizeFolders(value) {
  if (!Array.isArray(value)) throw new TypeError("Window Workspace Folders must be an array.");
  const paths = new Set();
  const identities = new Set();
  return Object.freeze(value.map((folder) => {
    const folderPath = typeof folder?.path === "string" ? folder.path.trim() : "";
    if (!folderPath) throw new TypeError("Window Workspace Folder path is required.");
    if (paths.has(folderPath)) throw new Error(`Duplicate Workspace Folder path: ${folderPath}.`);
    paths.add(folderPath);

    const workspace = folder?.workspace;
    const identity = typeof workspace?.workspaceInstanceId === "string" && workspace.workspaceInstanceId.trim()
      ? workspace.workspaceInstanceId.trim()
      : typeof workspace?.id === "string" ? workspace.id.trim() : "";
    if (!identity) throw new TypeError("Window Workspace Folder identity is required.");
    if (identities.has(identity)) throw new Error(`Duplicate Workspace Folder identity: ${identity}.`);
    identities.add(identity);
    return Object.freeze({ path: folderPath, workspace: Object.freeze({ ...workspace }) });
  }));
}
