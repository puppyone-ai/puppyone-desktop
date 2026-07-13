# Third-party notices

## Integration product marks

The Agent selector includes local vector marks solely to identify user-selected
third-party products. Claude and Claude Code are marks of Anthropic PBC; Cursor
is a mark of Anysphere, Inc.; OpenCode and its mark belong to their respective
owners. Their appearance does not imply sponsorship or endorsement.

The Claude mark follows Anthropic's published product identity, the Cursor mark
follows Cursor's official application/brand asset, and the OpenCode mark comes
from `packages/identity/mark.svg` in the official OpenCode repository. PuppyOne
ships bounded local SVG copies so opening a menu never performs a remote image
request.

## OpenCode

PuppyOne Desktop can distribute and run the OpenCode coding-agent harness as
the managed kernel behind PuppyOne Agent. The adopted runtime release is
`v1.17.18` at commit
`b8374b5a7c532e51aeb66b1dee9278de91526ef5`; its prompt hashes are taken from
that exact commit. Broader architecture behavior was also audited at later
source commit `9976269ab1accfc9f9dc98a4a688c516934de422`.
The main process communicates with the runtime through Agent Client Protocol
v1 over NDJSON JSON-RPC 2.0. The retired HTTP SDK client is not shipped.

OpenCode is Copyright (c) 2025 opencode and licensed under the MIT License.
The complete license text is distributed at `vendor/opencode/LICENSE` and in
the packaged `resources/opencode/LICENSE` file.

The exact artifact hashes, prompt-source hashes, and source-adoption ledger are
distributed in `vendor/opencode/`.

## Claude Agent SDK

PuppyOne Desktop uses the exact-version
`@anthropic-ai/claude-agent-sdk@0.3.159` as the control layer for the native
Claude Code backend. PuppyOne does not redistribute the SDK's optional
platform executable; the backend uses the user's canonical Claude Code
installation. The SDK is © Anthropic PBC, all rights reserved, and its use is
subject to Anthropic's applicable legal agreements. The package license notice is retained at
`vendor/claude-agent-sdk/LICENSE.md`; current terms are linked from
https://code.claude.com/docs/en/legal-and-compliance.

Anthropic's published authentication policy does not permit third-party
products to route traffic through users' Free, Pro or Max Claude subscription
credentials. PuppyOne therefore requires an Anthropic API key or a supported
cloud-provider credential for this backend and does not copy Claude credential
files. Claude Agent SDK usage may be subject to Anthropic's documented data
collection, usage and retention policies.

## Claudian frontend reference

PuppyOne Desktop selectively adapts interaction, presentation and native
protocol orchestration patterns from `YishenTu/claudian` at immutable commit
`7d7cc84c60a77431aaccda7ff49a2f1f4ae1c2ab`. The adopted runtime patterns are
the persistent Claude SDK message channel, Electron-safe CLI spawning, and ACP
method compatibility/event normalization. PuppyOne rewrites these patterns
under its own typed `AgentRuntimePort`, canonical workspace boundary, approval
policy, React design tokens, accessibility behavior and virtualization.
Claudian credential stores, prompts, conversation persistence and Obsidian
integration are not included.

Claudian is licensed under the MIT License. The complete license, source map and
CycloneDX record are distributed in `vendor/claudian/LICENSE`,
`vendor/claudian/SOURCE_ADOPTION.md` and `vendor/claudian/SBOM.cdx.json`.

## saxes

PuppyOne Desktop uses saxes 6.0.0 to parse namespace-aware WordprocessingML.
saxes is licensed under the ISC License:

> Copyright (c) Contributors
>
> Permission to use, copy, modify, and/or distribute this software for any
> purpose with or without fee is hereby granted, provided that the above
> copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
> WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
> MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
> SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
> WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
> OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
> CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

saxes was forked from sax, whose included code is also licensed under the ISC
License with this notice:

> Copyright (c) Isaac Z. Schlueter and Contributors
>
> Permission to use, copy, modify, and/or distribute this software for any
> purpose with or without fee is hereby granted, provided that the above
> copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
> WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
> MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
> SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
> WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
> OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
> CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
