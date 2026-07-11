# Third-party notices

## OpenCode

PuppyOne Desktop can distribute and run the OpenCode coding-agent harness as a
separate local sidecar. The adopted runtime release is `v1.17.18` at commit
`b8374b5a7c532e51aeb66b1dee9278de91526ef5`; its prompt hashes are taken from
that exact commit. Broader architecture behavior was also audited at later
source commit `9976269ab1accfc9f9dc98a4a688c516934de422`.
The main process also uses the exact-version `@opencode-ai/sdk@1.17.18`
generated client; its PATH-spawning server helper is not used.

OpenCode is Copyright (c) 2025 opencode and licensed under the MIT License.
The complete license text is distributed at `vendor/opencode/LICENSE` and in
the packaged `resources/opencode/LICENSE` file.

The exact artifact hashes, prompt-source hashes, and source-adoption ledger are
distributed in `vendor/opencode/`.

## Claudian frontend reference

PuppyOne Desktop's Agent Chat frontend selectively adapts interaction and
presentation patterns from `YishenTu/claudian` at immutable commit
`7d7cc84c60a77431aaccda7ff49a2f1f4ae1c2ab`. The adopted scope is limited to
message flow, compact tool disclosures, inline diff presentation, composer and
picker behavior. PuppyOne rewrites these patterns in React with its own design
tokens, typed Agent contract, accessibility behavior and virtualization.
Claudian runtime, provider, credential, session, prompt and Obsidian code is not
included; OpenCode remains PuppyOne's sole product Chat Harness.

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
