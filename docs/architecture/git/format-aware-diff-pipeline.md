# Format-Aware Diff Pipeline

**Status:** Implemented for unified text, DOCX semantic redline, and honest
metadata fallback. Excel, image, PDF, audio, and video-specific comparisons are
future contributions, not conditions in the Source Control view.

## Purpose and ownership

The Source Control shell owns selection, file status, file-level actions, and
Git mutations. The format-aware diff pipeline is read-only: it resolves how to
present one already-selected change. It never produces an applicable patch and
never gains stage, discard, checkout, or commit authority.

There are three separate decisions:

1. main/local Git code derives the immutable before/after revisions;
2. the canonical file-format registry identifies the file;
3. the ordered Diff Registry chooses a built-in presentation.

```text
authorized workspace + scope + selected path
                 |
                 v
main Revision Pair Authority
  before / after / missing / unavailable + opaque identities
                 |
                 v
resolveFileFormat({ name, mimeType })
                 |
                 v
DIFF_VIEWERS (first match wins)
  docx-redline -> text-unified -> binary-summary
                 |
                 v
bounded provider model -> read-only React renderer
```

`GitStatusView` renders `FormatAwareDiff`; it contains no extension-specific or
binary-format decision tree. A new semantic comparator is added as a typed
contribution under `src/features/source-control/diff/`, ahead of the total
fallback.

## Diff Registry contract

`DIFF_VIEWERS` is deterministic and built-in only. Each contribution declares
an id, version, source requirement, matcher, and renderer. Resolution first
calls the shared `resolveFileFormat()` implementation and then selects the first
matching contribution:

| Contribution | Source | Match |
| --- | --- | --- |
| `docx-redline` | `resource-pair` | canonical format is `docx`, a revision pair exists, and main identified OOXML DOCX MIME (legacy `.doc` stays on fallback) |
| `text-unified` | `git-patch` | Git did not mark binary and the canonical format is text-like, or Git produced text lines |
| `binary-summary` | `metadata` | unconditional fallback |

The fallback shows format, before/after presence and bounded byte metadata. It
does not invent line statistics. When the current local file can be opened, the
trusted Source Control shell supplies that escape hatch.

The editor viewer registry and Diff Registry deliberately remain separate. A
single-document preview has a different authority and lifecycle from a
two-revision comparison, although both reuse canonical format recognition and
Office package preflight.

## Revision Pair Authority

The renderer requests only `{ rootPath, path, scope, requestId, sessionId }`.
The assigned workspace root is authorized in main. The renderer cannot submit a
Git ref, object id, old path, absolute path, or resource bytes.

Trusted Git status and comparison code derives this matrix:

| Scope | Before | After |
| --- | --- | --- |
| `unstaged` | stage-0 index blob | regular working-tree file |
| `untracked` | explicit missing side | regular working-tree file |
| `staged` | `HEAD` blob, or missing for an unborn repository/addition | stage-0 index blob |
| `committed` | trusted remote merge-base | local `HEAD` |
| `remote` | trusted local/remote merge-base | fetched remote-tracking ref |

Added and deleted files become explicit missing sides. Rename/copy metadata
supplies separate old and new relative paths; both paths are included in the
trusted Git pathspec so the parsed patch and revision pair agree.

Git blobs use their object id as the revision identity. A successful
working-tree read rejects symlinks/non-files and realpath escapes, checks stat
metadata before and after the read, and uses a content-bound opaque identity.
Missing and unavailable sides also receive deterministic opaque identities. No
absolute path or ref crosses the renderer bridge.

Small valid UTF-8 revisions may be returned as bounded text (1 MiB maximum).
Binary resources are capped at 25 MiB per side. Oversized, conflicted, symlink,
and non-file sources are explicit `unavailable` states rather than empty data.

## Resource broker and IPC lifecycle

Resource bytes remain in main until a provider asks for an issued handle.
`git-diff-resource-broker.mjs` binds every opaque handle to:

- the owner `webContents` id;
- a bounded renderer session id;
- the selection identity;
- the exact before/after revision identity;
- a 25 MiB per-resource limit, two-read retry budget, and two-minute TTL.

A detail session can hold at most four handles. Reads return a defensive copy;
identity/audience mismatches fail closed. Selection cleanup invokes the
cancellation IPC, aborts Git reads and idle waits, and revokes the entire
session. Window destruction revokes every handle owned by that renderer.
Revocation zeroes broker-held bytes.

The controller supplies monotonically unique request/session ids. Both the
controller and the rich renderer check request/selection identity before
committing results. A superseded or aborted selection therefore commits zero
models.

## DOCX semantic redline

DOCX is the first resource-pair contribution. `DocxRedlineDiff` dynamically
loads its provider; the provider reads the two authorized handles and transfers
their buffers to a disposable module worker. The worker dynamically loads
JSZip, runs the existing Office decompression preflight, and extracts only
`word/document.xml`.

The normalization model contains body headings, list items, paragraphs, and
table rows/cell text. Consecutive runs become readable text blocks. Unique
anchors plus bounded gap alignment locate structural changes, followed by a
bounded word-level LCS inside modified blocks. The renderer displays semantic
word and block statistics with paragraph/table locations.

It intentionally does not compare raw ZIP entries, XML strings, or
`docx-preview` HTML. Styling, pagination, comments, headers/footers, and full
Word Track Changes fidelity are excluded and stated in the UI.

Safety budgets include:

- 16 MiB per expanded entry and 64 MiB total declared expansion;
- 250,000 XML start tags;
- 12,000 normalized blocks and 2,000,000 text characters;
- bounded block-alignment and word-diff matrices;
- 1,200 presented changes and a 20-second worker timeout.

Malformed, encrypted, over-budget, missing-both, and unavailable inputs become
explicit retryable errors. One-sided added/deleted documents and no-semantic-
change documents have distinct visible states.

Successful models use an eight-entry LRU keyed by repository identity, path,
before identity, after identity, and renderer version. Aborts and failures do
not populate the cache. Identity or renderer-version changes necessarily miss.

## Extension rules

Future Excel, image, and PDF comparators must:

- add a typed contribution before `binary-summary`;
- consume only an authorized revision-pair source;
- produce a format-specific serializable presentation model;
- define input, CPU, expansion, output, timeout, and cache budgets;
- keep parsing behind a dynamic worker boundary;
- expose honest loading, error, empty, one-sided, truncation, and fidelity states;
- leave all Git mutations in the Source Control shell.

Third-party Viewer Packs cannot register diff contributions. Pack v1 grants one
document at a time; dual-revision access requires a separate manifest,
permission, audience, and broker design.

## Verification map

- `tests/formatAwareDiffRegistry.test.ts` and
  `tests/formatAwareDiffArchitecture.test.ts`: ordering, canonical resolution,
  fallback, and lazy boundaries.
- `tests/gitRevisionSpecs.test.mjs` and
  `tests/workspace.git.integration.test.mjs`: every scope, missing sides,
  rename/delete, real remote divergence, limits, cancellation, and path safety.
- `tests/gitDiffResourceBroker.test.mjs` and IPC tests: audience, identity,
  read/size/TTL budgets, release, cancellation, and workspace authorization.
- `tests/docxRedline*.test.ts`: package failures, encryption, budgets,
  normalization, word redline, cache behavior, and all renderer states.
- `tests/diffLifecycle.test.ts`: stale-result rejection.

## Invariants

- Renderer input never creates Git refs, object ids, absolute paths, or grants.
- Contribution code is read-only and cannot mutate Git or the workspace.
- Unknown formats always resolve to an honest metadata presentation.
- A successful model is committed only for the exact active selection and
  revision identities.
- Heavy document parsing never enters the startup bundle or Renderer main
  thread.
