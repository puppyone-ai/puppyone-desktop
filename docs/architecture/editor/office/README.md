# Managed Office Editing Runtime

PuppyOne edits `.docx`, `.xlsx`, and `.pptx` through the process-neutral
`OfficeEditingPort`. The existing `office-preview` contribution remains the
only route: it mounts the managed editor when the Experimental setting is on
and the PuppyOne service is available, and otherwise renders the bounded local
Preview.

Desktop users do not install Docker, configure a Document Server, provide an
engine JWT, or expose a callback listener.

## Runtime boundary

```text
DataWorkspace -> EditorHost -> office-preview contribution
                                  |
                    OfficeEditingPort (no Electron imports)
                                  |
          trusted preload IPC -> Electron OfficeEditingService
                                  |
                       PuppyOne Cloud Auth
                                  |
                        /api/v1/office
                                  |
              managed ONLYOFFICE + Redis + private S3
                                  |
                  sandboxed WebContentsView
                                  |
              versioned atomic local file writer
```

Electron authorizes the current window's canonical workspace root, reads the
source bytes, and uploads only filename, bytes, and locale over the current
authenticated PuppyOne session. An absolute Desktop path never leaves the
machine.

PuppyOne backend is the only holder of the document-server URL, JWT and
capability secrets, callback handling, result-origin allowlist, Redis address,
and private storage settings. Desktop receives a short-lived signed launch
configuration but retains it in Electron Main; Shared UI sees only opaque
session/surface identifiers and status.

## Experimental product gate

`ExperimentalSettings.enableOfficeEditing` is persisted by the App Host and
defaults to `false`. Only an opted-in local Host supplies
`DataPort.officeEditing`. The service cannot enable the experiment implicitly.

An unavailable, signed-out, offline, expired, or malformed managed session
falls back to the existing Office Preview without clearing selection. Once a
session has edits, save errors remain visible and recoverable instead of
silently remounting Preview.

## Native surface isolation

The ONLYOFFICE API runs in a temporary-partition `WebContentsView` with sandbox
and context isolation enabled; preload, Node, webviews, DevTools, dialogs,
permissions, navigation, and new windows are disabled. The trusted renderer
keeps `script-src 'self'`. Production API scripts must use HTTPS under
`puppyone.ai` and the exact `/web-apps/apps/api/documents/api.js` path;
loopback is allowed only for development.

## Persistence and recovery

- Desktop uploads at most 100 MiB and records the exact local base version.
- Backend stores source/result objects privately and session metadata in Redis
  with a hard TTL.
- Engine source and callback routes use distinct purpose-bound, expiring HMAC
  capabilities. Callback bodies additionally require the ONLYOFFICE JWT and
  exact document key, status, URL, and file-type match.
- Result URLs and every redirect must remain on an exact allowlist and pass
  timeout and byte limits.
- Desktop polls monotonically versioned results and commits them through the
  shared per-path, version-checked atomic binary writer.
- An external local change preserves the managed result in mode-`0600`
  recovery storage and requires an explicit keep-edited or keep-external
  choice; callbacks never authorize a blind overwrite.
- Normal close removes remote session state and temporary objects; expiry and
  storage lifecycle are the backstop for interrupted cleanup.

Legacy, macro/binary, template, slideshow, RTF, and OpenDocument variants stay
on Preview until an explicit round-trip preservation policy is implemented.
