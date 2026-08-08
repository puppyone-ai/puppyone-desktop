# Office Editing Runtime

PuppyOne edits modern OOXML Word, Excel, and PowerPoint resources through the
process-neutral `OfficeEditingPort`. The built-in Office viewer is the only
route: it mounts the configured editing engine when the Host supplies that port
and otherwise keeps the existing bounded preview as the mandatory fallback.

## Runtime boundary

```text
DataWorkspace -> EditorHost -> office-preview contribution
                                  |
                    OfficeEditingPort (no Electron imports)
                                  |
          trusted preload IPC -> main OfficeEditingService
                                  |
                  sandboxed WebContentsView
                                  |
             signed ONLYOFFICE config + loopback bridge
                                  |
                  source GET / callback POST
                                  |
              shared versioned atomic file writer
```

The trusted renderer receives only opaque session/surface identifiers and
status. The signed editor configuration and third-party API script stay in a
dedicated sandboxed `WebContentsView` with no preload, Node, webview, DevTools,
or permission authority; the application CSP remains `script-src 'self'`. The
main process authorizes the current window's workspace root, resolves the
canonical path, serves only the capability-scoped source, validates callback
capabilities, restricts result downloads to configured origins, and bounds
every body and timeout.

## Persistence and close semantics

- Force-save callback status `6` and final-save status `2` use the same binary
  writer as text Document Sessions: per-path serialization, SHA-256 base
  version, mode-preserving temporary inode, file and directory `fsync`, a
  second optimistic-version check, and atomic rename.
- A status `2` callback may arrive after the React surface unmounts. Therefore
  the main-owned session remains alive for its expiry window; unmount only
  detaches the renderer and requests a normal editor close.
- An external version mismatch never overwrites either side. The received
  Office bytes are written to the app recovery directory with mode `0600` and
  the session enters `conflict`. The user can then keep the recovered Office
  result or the externally changed workspace file.
- Workspace watcher attribution and edit-review absorption happen only after a
  durable replacement succeeds.

## Configuration

Set `PUPPYONE_OFFICE_DOCUMENT_SERVER_URL` and a matching
`PUPPYONE_OFFICE_JWT_SECRET`. The bridge binds to loopback by default. If the
Document Server runs in Docker or another network, also pin
`PUPPYONE_OFFICE_BRIDGE_PORT` and configure
`PUPPYONE_OFFICE_BRIDGE_PUBLIC_URL` to a URL the server can reach. Additional
result origins must be explicitly listed in
`PUPPYONE_OFFICE_DOWNLOAD_ORIGINS`.

Legacy `.doc`, `.xls`, `.ppt`, macro/binary variants, OpenDocument, and `.rtf`
stay on the preview path. Full editing is deliberately enabled for `.docx`,
`.xlsx`, and `.pptx`; the callback must declare that same file type before the
result can enter the atomic writer.
