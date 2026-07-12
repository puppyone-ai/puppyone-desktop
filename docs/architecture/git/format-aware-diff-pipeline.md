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

`GitFileDiffSurface` renders `FormatAwareDiff` and is reused by focused Changes
and embedded History files; neither it nor `GitStatusView` contains an
extension-specific or binary-format decision tree. Shared selection, lifecycle,
registry, and cache primitives live under `diff/core/`. Each comparator is a
vertical slice under `diff/contributions/<contribution-id>/` and owns its
matcher, presentation, provider, model, budgets, cache, worker, and tests. A new
semantic comparator is registered ahead of the total fallback without adding
branches to the shell.

## Diff Registry contract

`DIFF_VIEWERS` is deterministic and built-in only. Each contribution declares
an id, version, synchronous/asynchronous kind, source requirement, matcher, and
renderer. Resolution first calls the shared `resolveFileFormat()` implementation
and then selects the first matching contribution:

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
working-tree read rejects symlinks/non-files and realpath escapes. It opens the
canonical path through a read-only `O_NOFOLLOW` file descriptor, matches that
descriptor to the original path snapshot, performs a size-bounded descriptor
read, and matches both the descriptor and path again after the read. The
resulting opaque identity is content-bound rather than metadata-only.
Missing and unavailable sides also receive deterministic opaque identities. No
absolute path or ref crosses the renderer bridge.

Small valid UTF-8 revisions may be returned as bounded text (1 MiB maximum).
Binary resources are capped at 25 MiB per side. Oversized, conflicted, symlink,
and non-file sources are explicit `unavailable` states rather than empty data.

## Resource broker and IPC lifecycle

Resource bytes remain in main until a provider asks for an issued handle.
`git-diff-resource-broker.mjs` takes ownership of the already-bounded buffer
without making a second full-size copy and binds every opaque handle to:

- the owner `webContents` id;
- a bounded renderer session id;
- the selection identity;
- the exact before/after revision identity;
- a 25 MiB per-resource limit, bounded read-operation/read-byte budgets, and a
  two-minute absolute TTL.

A detail session can hold at most four handles and 50 MiB. Each renderer may
hold four sessions and 100 MiB; the process-wide broker is capped at 256 MiB.
Reads are defensive copies of ranges no larger than 4 MiB, so Electron never
serializes a 25 MiB revision in one message. Every response repeats offset,
total size, completion state, and both identities; the renderer validates all
of them while assembling its exact-size buffer. Audience, identity, quota, or
range mismatches fail closed.

The broker schedules cleanup at the nearest expiry rather than waiting for a
future read. A successful provider load or cache hit releases the session;
selection cancellation aborts Git reads and revokes the session; window
destruction revokes every handle owned by that renderer. Revocation and expiry
zero broker-owned bytes.

The controller supplies monotonically unique request/session ids. Both the
controller and the rich renderer check request/selection identity before
committing results. A superseded or aborted selection therefore commits zero
models.

## DOCX semantic redline

DOCX is the first asynchronous resource-pair contribution. The generic async
contribution lifecycle owns abort, stale-identity rejection, loading, error,
and retry behavior; the DOCX contribution supplies only its identity, provider,
and presentation views. Its provider reads the two authorized handles and
transfers their buffers to a disposable module worker. The worker dynamically
loads JSZip, runs the existing Office decompression preflight, and extracts only
`word/document.xml`.

WordprocessingML is parsed with a namespace-aware streaming SAX parser. The
normalizer recognizes both transitional and strict WordprocessingML namespace
URIs independent of the document's chosen prefix, rejects DTDs, rejects
malformed XML, and ignores tracked deletion/move-from content. It never uses a
regular expression as an XML tokenizer.

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
- 512 XML nesting levels;
- 12,000 normalized blocks and 2,000,000 text characters;
- bounded block-alignment and word-diff matrices;
- 1,200 presented changes and a 20-second worker timeout.

Malformed, encrypted, over-budget, missing-both, and unavailable inputs become
explicit retryable errors. One-sided added/deleted documents and no-semantic-
change documents have distinct visible states.

Successful models use a weighted, actively expiring LRU keyed by repository
identity, path, before identity, after identity, and renderer version. It is
bounded by eight entries, 24 MiB of estimated presentation data, and a
five-minute TTL. Workspace changes clear every loaded format-aware cache.
Aborts and failures do not populate the cache. Identity or renderer-version
changes necessarily miss.

## Extension rules

Future Excel, image, and PDF comparators must:

- add one typed vertical slice under `diff/contributions/<id>/` and register it
  before `binary-summary`;
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
  range/read/size/cumulative/TTL budgets, active expiry, zeroing, release,
  cancellation, and workspace authorization.
- `tests/localFiles.git-diff-resource.test.ts`: renderer chunk assembly,
  response validation, and cancellation boundaries.
- `tests/docxRedline*.test.ts`: package failures, encryption, budgets,
  namespace-aware normalization, word redline, weighted/TTL cache behavior,
  session release, and all renderer states.
- `tests/diffLifecycle.test.tsx`: generic abort, stale-result rejection, error,
  and retry behavior.
- `npm run smoke:format-aware-diff`: real Electron preload/IPC, authorized Git
  revision derivation, multi-chunk reads, cross-renderer denial, and release.

## Invariants

- Renderer input never creates Git refs, object ids, absolute paths, or grants.
- Contribution code is read-only and cannot mutate Git or the workspace.
- Unknown formats always resolve to an honest metadata presentation.
- A successful model is committed only for the exact active selection and
  revision identities.
- Heavy document parsing never enters the startup bundle or Renderer main
  thread.
