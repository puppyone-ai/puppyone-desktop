# Desktop Cross-Platform Runtime and Delivery

**Status:** Active architecture contract. macOS is the shipped release target;
Windows and Linux are contract-tested targets that remain gated until their
native package, security, and update verification is complete.

## System shape

```text
Product features (src/features)
        |
        v
Application ports + typed preload bridge
        |
        v
Electron composition root (electron/main.mjs)
        |
        +---------------- Desktop Platform Host ----------------+
        |                         |                              |
        v                         v                              v
  macOS adapter             Windows adapter                 Linux adapter
  - dock/window             - window/shell                 - window/shell
  - Keychain                - DPAPI                         - safe-storage policy
  - office convert          - unsupported port             - unsupported port

Shared release identity (one source commit + version + channel)
        |
        +---------------- Target Manifest -----------------------+
        |                         |                              |
        v                         v                              v
  macos-arm64               windows-x64                    linux-x64
  dmg + zip                 NSIS                           AppImage
  Apple evidence            Authenticode evidence          Linux provenance
        \_________________________|______________________________/
                                  v
                         Release Set aggregator
                                  |
                                  v
                  channel publisher + update coordinates
```

## Ownership rules

- `shared/desktop/` contains process-neutral platform, release, application,
  artifact, and distribution contracts. It must not import Electron, React, or
  operating-system APIs.
- `electron/main/platform/` is the runtime composition boundary. Product code
  asks for capabilities or ports; it does not branch on `process.platform`.
- `tooling/desktop/targets/target-manifest.mjs` is the only declaration of
  supported target/runners, package formats, updater tracks, pinned upstream
  runtime keys, and release participation.
- `tooling/desktop/build/platforms/` owns native `electron-builder`
  configuration. The base configuration in `package.json` remains
  platform-neutral.
- `tooling/desktop/release/release-set.mjs` validates that one Release Identity
  has every required target and no target that is disabled for the channel.
- Existing schema-1 Build Identity and schema-2 macOS release metadata remain
  compatibility adapters until all shipped Mac clients have safely migrated.

## Target policy

| Target | Native CI runner | Contract tests | Internal | Stable |
| --- | --- | --- | --- | --- |
| `macos-arm64` | `macos-15` | required | required | required |
| `windows-x64` | `windows-2025` | required | optional/gated | disabled |
| `linux-x64` | `ubuntu-24.04` | required | optional/gated | disabled |

Changing a target from optional/disabled to required is a release-policy
change. It requires native install/uninstall testing, clean-machine smoke tests,
platform security evidence, update/rollback verification, and publisher support.

## CI/CD contract

Pull requests and `main` pushes resolve the native test matrix from the Target
Manifest and run the platform contract suite on all three operating systems.
The main Linux CI job still runs lint, all tests, the production renderer build,
and architecture checks.

Internal and Stable macOS workflows select `macos-arm64` explicitly and consume
its upstream runtime key from the manifest. This preserves the shipped Mac
artifact names, R2 prefixes, update feed, signing, notarization, and promotion
path. Multi-platform publication is introduced by producing one immutable
target bundle per native runner and aggregating their digests into one Release
Set before any mutable `latest` pointer changes.

## Expansion checklist

To activate another platform:

1. Complete the platform Host ports and remove unsupported capability flags.
2. Make the native package verifier prove executable architecture, embedded
   Build Identity, runtime payload, update metadata, and security evidence.
3. Run install, launch, workspace, terminal, credential storage, update, and
   uninstall tests on clean native machines.
4. Enable Internal participation first and collect Release Set evidence.
5. Add signing/timestamping or repository trust, updater rollback checks, and
   operational monitoring.
6. Enable Stable participation only after publisher and support runbooks pass.

The invariant is that platform growth adds adapters and Target Manifest data;
it must not fork product features or create a second release identity system.
