import path from "node:path";
import { createWorktreeGitOperationJournal } from "../cloud-publish-journal.mjs";

const JOURNAL_FILENAME = "pending-auto-commit.v1.json";
const PHASES = new Set(["prepared", "staged", "committed"]);

export function createGitAutoCommitTransactionJournal(options = {}) {
  const store = createWorktreeGitOperationJournal({
    ...options,
    filename: JOURNAL_FILENAME,
    normalizeEntry: normalizeGitAutoCommitJournalRecord,
    canTransition: (from, to) => (
      from === to
      || (from === "prepared" && to === "staged")
      || (from === "staged" && to === "committed")
    ),
  });

  return Object.freeze({
    read: store.read,
    resolvePaths: store.resolvePaths,
    create: (rootPath, record) => store.write(rootPath, record, { createOnly: true }),
    update: (rootPath, current, patch) => store.write(rootPath, {
      ...current,
      ...patch,
      revision: current.revision + 1,
    }, {
      expectedOperationId: current.operation_id,
      expectedRevision: current.revision,
      expectedPhase: current.phase,
    }),
    clear: (rootPath, current) => store.clear(rootPath, {
      expectedOperationId: current.operation_id,
      expectedRevision: current.revision,
      expectedPhase: current.phase,
    }),
  });
}

export function normalizeGitAutoCommitJournalRecord(value) {
  if (!value || typeof value !== "object" || value.schema_version !== 1) {
    throw new Error("Git Auto Commit journal schema is unsupported.");
  }
  const operationId = normalizeText(value.operation_id, 128);
  const phase = normalizeText(value.phase, 32);
  const workspaceKey = normalizeHex(value.workspace_key, 64, false);
  const branchRef = normalizeBranchRef(value.branch_ref);
  const expectedHead = normalizeHex(value.expected_head, null, true);
  const initialIndexTree = normalizeHex(value.initial_index_tree, null, false);
  const temporaryIndexName = normalizeTemporaryIndexName(value.temporary_index_name);
  const paths = normalizePaths(value.paths);
  const pathEntries = normalizePathEntries(value.path_entries, paths);
  const stagedTree = normalizeHex(value.staged_tree, null, true);
  const resultingCommit = normalizeHex(value.resulting_commit, null, true);
  if (!operationId || !PHASES.has(phase) || !workspaceKey || !branchRef || !temporaryIndexName) {
    throw new Error("Git Auto Commit journal identity is invalid.");
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new Error("Git Auto Commit journal revision is invalid.");
  }
  if (!Number.isSafeInteger(value.content_epoch) || value.content_epoch < 0) {
    throw new Error("Git Auto Commit journal content epoch is invalid.");
  }
  if (phase !== "prepared" && (!stagedTree || pathEntries.length !== paths.length)) {
    throw new Error("Git Auto Commit staged journal state is incomplete.");
  }
  if (phase === "committed" && !resultingCommit) {
    throw new Error("Git Auto Commit committed journal state is incomplete.");
  }
  return Object.freeze({
    schema_version: 1,
    operation_id: operationId,
    revision: value.revision,
    phase,
    workspace_key: workspaceKey,
    branch_ref: branchRef,
    expected_head: expectedHead,
    initial_index_tree: initialIndexTree,
    temporary_index_name: temporaryIndexName,
    paths: Object.freeze(paths),
    path_entries: Object.freeze(pathEntries),
    content_epoch: value.content_epoch,
    staged_tree: stagedTree,
    resulting_commit: resultingCommit,
    created_at: normalizeText(value.created_at, 64),
    updated_at: normalizeText(value.updated_at, 64),
  });
}

export function resolveJournalTemporaryIndexPath(journalDirectory, record) {
  const candidate = path.resolve(journalDirectory, record.temporary_index_name);
  if (path.dirname(candidate) !== path.resolve(journalDirectory)) {
    throw new Error("Git Auto Commit temporary index escaped its journal directory.");
  }
  return candidate;
}

function normalizePaths(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error("Git Auto Commit journal path set is invalid.");
  }
  const paths = value.map((item) => normalizeText(item, 4096));
  if (paths.some((item) => !item || item.includes("\0")) || new Set(paths).size !== paths.length) {
    throw new Error("Git Auto Commit journal paths are invalid.");
  }
  return paths;
}

function normalizePathEntries(value, paths) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error("Git Auto Commit journal index entries are invalid.");
  }
  const pathSet = new Set(paths);
  return value.map((entry) => {
    const entryPath = normalizeText(entry?.path, 4096);
    const mode = normalizeText(entry?.mode, 16);
    const blob = normalizeHex(entry?.blob, null, false);
    if (!pathSet.has(entryPath) || !/^(?:100644|100755|120000)$/.test(mode) || !blob) {
      throw new Error("Git Auto Commit journal index entry is invalid.");
    }
    return Object.freeze({ path: entryPath, mode, blob });
  });
}

function normalizeTemporaryIndexName(value) {
  const text = normalizeText(value, 160);
  return /^auto-commit-index\.[0-9a-f-]+$/.test(text) ? text : "";
}

function normalizeBranchRef(value) {
  const text = normalizeText(value, 1024);
  return text.startsWith("refs/heads/") && !text.includes("..") && !text.includes("\0") ? text : "";
}

function normalizeHex(value, exactLength, nullable) {
  if (nullable && value == null) return null;
  const text = normalizeText(value, 128);
  if (!/^[0-9a-f]+$/i.test(text)) return "";
  if (exactLength && text.length !== exactLength) return "";
  if (!exactLength && text.length !== 40 && text.length !== 64) return "";
  return text.toLowerCase();
}

function normalizeText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
