# Claude Code release recovery

This directory contains an evidence-first, incremental method for recovering
later Claude Code releases from authenticated adjacent published packages
and the most recent matching source-map oracle.

The checked-in cases are:

- [`2.1.88 → 2.1.89`](./cases/2.1.88-to-2.1.89/REPORT.md), the initial
  source-map-to-package recovery;
- [`2.1.89 → 2.1.90`](./cases/2.1.89-to-2.1.90/REPORT.md), the first
  adjacent incremental recovery;
- [`2.1.90 → 2.1.91`](./cases/2.1.90-to-2.1.91/REPORT.md), the second
  adjacent incremental recovery;
- [`2.1.91 → 2.1.92`](./cases/2.1.91-to-2.1.92/REPORT.md), the third
  adjacent incremental recovery;
- [`2.1.92 → 2.1.94`](./cases/2.1.92-to-2.1.94/REPORT.md), the fourth
  incremental recovery;
- [`2.1.94 → 2.1.96`](./cases/2.1.94-to-2.1.96/REPORT.md), the fifth
  incremental recovery;
- [`2.1.96 → 2.1.97`](./cases/2.1.96-to-2.1.97/REPORT.md), the sixth
  incremental recovery;
- [`2.1.97 → 2.1.98`](./cases/2.1.97-to-2.1.98/REPORT.md), the seventh
  incremental recovery;
- [`2.1.98 → 2.1.100`](./cases/2.1.98-to-2.1.100/REPORT.md), the eighth
  incremental recovery;
- [`2.1.100 → 2.1.101`](./cases/2.1.100-to-2.1.101/REPORT.md), the ninth
  incremental recovery;
- [`2.1.101 → 2.1.104`](./cases/2.1.101-to-2.1.104/REPORT.md), the tenth
  incremental recovery;
- [`2.1.104 → 2.1.105`](./cases/2.1.104-to-2.1.105/REPORT.md), the eleventh
  incremental recovery;
- [`2.1.105 → 2.1.107`](./cases/2.1.105-to-2.1.107/REPORT.md), the twelfth
  incremental recovery;
- [`2.1.107 → 2.1.108`](./cases/2.1.107-to-2.1.108/REPORT.md), the thirteenth
  incremental recovery;
- [`2.1.108 → 2.1.109`](./cases/2.1.108-to-2.1.109/REPORT.md), the fourteenth
  adjacent incremental recovery;
- [`2.1.109 → 2.1.110`](./cases/2.1.109-to-2.1.110/REPORT.md), the fifteenth
  adjacent incremental recovery;
- [`2.1.110 → 2.1.111`](./cases/2.1.110-to-2.1.111/REPORT.md), the sixteenth
  adjacent incremental recovery;
- [`2.1.111 → 2.1.112`](./cases/2.1.111-to-2.1.112/REPORT.md), the
  seventeenth adjacent npm-package recovery;
- [`2.1.112 → 2.1.113`](./cases/2.1.112-to-2.1.113/REPORT.md), the eighteenth
  adjacent recovery and the first native-packaging case;
- [`2.1.113 → 2.1.114`](./cases/2.1.113-to-2.1.114/REPORT.md), the nineteenth
  adjacent recovery;
- [`2.1.114 → 2.1.116`](./cases/2.1.114-to-2.1.116/REPORT.md), the twentieth
  adjacent recovery;
- [`2.1.116 → 2.1.117`](./cases/2.1.116-to-2.1.117/REPORT.md), the twenty-first
  adjacent recovery;
- [`2.1.117 → 2.1.118`](./cases/2.1.117-to-2.1.118/REPORT.md), the twenty-second
  adjacent recovery;
- [`2.1.118 → 2.1.119`](./cases/2.1.118-to-2.1.119/REPORT.md), the twenty-third
  adjacent recovery;
- [`2.1.119 → 2.1.120`](./cases/2.1.119-to-2.1.120/REPORT.md), the twenty-fourth
  adjacent recovery;
- [`2.1.120 → 2.1.121`](./cases/2.1.120-to-2.1.121/REPORT.md), the twenty-fifth
  adjacent recovery;
- [`2.1.121 → 2.1.122`](./cases/2.1.121-to-2.1.122/REPORT.md), the twenty-sixth
  adjacent recovery;
- [`2.1.122 → 2.1.123`](./cases/2.1.122-to-2.1.123/REPORT.md), the twenty-seventh
  adjacent recovery;
- [`2.1.123 → 2.1.124`](./cases/2.1.123-to-2.1.124/REPORT.md), the twenty-eighth
  adjacent recovery; and
- [`2.1.124 → 2.1.126`](./cases/2.1.124-to-2.1.126/REPORT.md), the current
  twenty-ninth adjacent recovery. Upstream did not publish 2.1.93, 2.1.95,
  2.1.99, 2.1.102, 2.1.103, 2.1.106, 2.1.115, or 2.1.125, so every multi-number
  advance is still one step in published-release order.

Each case has simultaneous completeness levels that must not be conflated:

- **generated/package complete**: the target wrapper and generated JavaScript
  reconstruct exactly, every generated offset is covered, and every
  JavaScript token is classified;
- **native authenticated**: from 2.1.113 onward, the selected signed platform
  executable and its Bun/JSC/native ranges are authenticated and independently
  verified; the executable is not falsely presented as reconstructed source;
- **first-party semantic complete**: the canonical semantic supplement and
  exhaustive unit ledger reproduce every observable first-party change at
  compiled AST/function semantics. Identifier spelling, independent
  declaration/function order, comments, formatting, and erased types do not
  affect this result; literals and property keys, branches, calls and call
  paths, prompts, rendering, state, and side effects do;
- **whole-bundle source incomplete**: embedded dependency runtime is still a
  recorded gap because the historical trees contain no root application
  manifest, dependency lock/source archive, or hermetic build definition; and
- **authored text unobservable**: original names, types, comments, formatting,
  and exact module placement erased by compilation are not claimed.

## Semantic reproduction from `src/`

An exhaustive 2026-08-10 audit rechecked the 21 transitions through 2.1.116
using compiled AST/function behavior as the source-reproduction criterion. It does not
require minified byte identity or preserve variable names, function order,
comments, formatting, or erased TypeScript syntax.

- All 21 generated recoveries covered by that historical audit replay the authenticated target
  `cli.js` byte-for-byte; this is a separate artifact-recovery result.
- Every changed, moved, or unresolved target structural unit has a pinned
  index, byte range, AST-node type, and source hash. Each unit is classified
  as identifier/order-only equivalence, dependency runtime, generated
  metadata, statically unreachable code, recovered first-party runtime, or a
  blocking first-party gap.
- Every recoverable first-party gap found by the audit is implemented in a
  case-local `semantic-supplement.patch` at the release where it first
  appears. The gate applies each supplement to its pinned historical commit,
  syntax-builds its source files, and verifies zero remaining first-party
  runtime gaps through the full ancestry.
- Whole-bundle semantic reproduction from `src/` remains false for all cases:
  embedded dependency units and their target versions/build inputs are not
  pinned, and no historical target has a complete root application manifest,
  lockfile, dependency source archive, and build configuration.

The machine-readable gap ledger is
[`source-reproduction-gaps.json`](./source-reproduction-gaps.json), and the
full table and fixes for that audit are in
[`SOURCE_REPRODUCTION_AUDIT.md`](./SOURCE_REPRODUCTION_AUDIT.md). Run the
non-conflating audit with:

```sh
pixi run node recovery/scripts/audit-source-reproduction.mjs
```

Use `--require-exact-source` when a failing gate is desired until whole-bundle
semantic equivalence is possible. It currently fails on the recorded
dependency/build-input gaps; it does not turn byte identity into the semantic
criterion.

For the current frozen release target, start with the
[`2.1.126 report`](./cases/2.1.124-to-2.1.126/REPORT.md),
[`manifest`](./cases/2.1.124-to-2.1.126/manifest.json), and
[`complete runbook`](./cases/2.1.124-to-2.1.126/RECOVERY_RUNBOOK.md).

## Deliverables

| Deliverable | Purpose |
| --- | --- |
| `binary-extraction/` | Bun graph discovery, canonical ranges, and independent verification |
| `diff/` | Exact embedded-JavaScript and wrapper recovery payloads |
| `package-members.json` | Exhaustive npm member path/mode/byte comparison |
| `attribution/` | Complete target generated-offset and source-candidate inventory |
| `structural/` | Complete target token/unit classification ledger |
| `readable-diff/` | Binding-aware full bundle diff, structural diff, and rename map |
| `semantic/` | Reviewed obligations, exhaustive nonmatched-unit source coverage, whole-bundle/source correspondence, and dependency/build-input gap ledgers |
| `recovered/` | Target-backed source-facing patches and executable models |
| `semantic-supplement.patch` | First-party behavior missing from the legacy readable overlay, applied at its introduction commit |

## Current source-tree state

The repository `src/` is the verified 2.1.88 outer/Bun-input source-map
baseline plus a selective cumulative merge of verified source-facing recovery
content for 2.1.89, 2.1.90, 2.1.91,
2.1.92, 2.1.94, 2.1.96, 2.1.97, 2.1.98, 2.1.100, 2.1.101, 2.1.104, 2.1.105,
2.1.107, 2.1.108, 2.1.109, 2.1.110, 2.1.111, 2.1.112, 2.1.113, 2.1.114,
2.1.116, 2.1.117, 2.1.118, 2.1.119, 2.1.120, 2.1.121, 2.1.122, 2.1.123,
2.1.124, and 2.1.126.
Upstream skipped 2.1.93, 2.1.95, 2.1.99, 2.1.102, 2.1.103, 2.1.106,
2.1.115, and 2.1.125.
The legacy `recovered/` overlays are not claims of the exact authored
TypeScript trees. The newer canonical semantic supplements close the
observable first-party behaviors that those narrower overlays omitted. Exact
authored spelling and whole-bundle dependency/build provenance remain separate
claims.

The release-by-release descriptions below document the original readable
overlay series. Statements that a behavior was then available only in the
generated bundle are superseded by the case's audited semantic supplement and
coverage ledger; the case report records the final disposition.

The 2.1.114 exact wrapper and embedded-JavaScript recovery is complete. Its
release-local source-facing overlay freezes the verified 2.1.114-facing target
as the twentieth recovered overlay. This does
not make the target's original authored TypeScript exactly observable.

The 2.1.116 exact wrapper and embedded-JavaScript recovery is also complete.
Its incremental source-facing overlay freezes the cumulative 2.1.116-facing
target as the twenty-first recovered overlay. Version 2.1.115 was not
published. The exact generated recovery and
the necessarily partial authored-source localization remain separate claims.

The 2.1.117 exact wrapper and embedded-JavaScript recovery is complete. Its
incremental source-facing overlay freezes the cumulative 2.1.117-facing target
as its twenty-second recovered overlay. The frozen patch touches 123 paths and
produces 1,957 files,
30,993,723 bytes, and framed SHA-256
`135719f7be0cccc9e4658e0f7b78d46e52d947cc171a9bf80b36e1081d727cee`.
All 122 target-existing changed source paths pass syntax construction, and the
three focused test files pass 8/8 in both base and applied-target orientations.
The complete generated/package claim and necessarily partial authored-source
localization remain separate.

The 2.1.118 exact wrapper and embedded-JavaScript recovery is complete. Its
incremental source-facing overlay freezes the release-local cumulative
2.1.118-facing target.
The patch records 306 paths (241 modified and 65 added), with 21,736 insertions
and 3,261 deletions. It produces 2,022 files,
31,570,676 bytes, and framed SHA-256
`c91ebcc114cbe577e4ffe43801e6014ade8e26d27271f57b0af1ce8ce9ff3d59`.
All 280 declared TypeScript/TSX paths pass syntax construction, and the four
focused suites pass 21/21 in both source orientations. The complete
generated/package claim and necessarily partial authored-source localization
remain separate.

The 2.1.119 exact wrapper and embedded-JavaScript recovery is complete. Its
incremental source-facing overlay freezes the release-local cumulative
2.1.119-facing target. The patch
records 290 paths (224 modified and 66 added), with 25,828 insertions and
1,994 deletions. It produces 2,088 files, 32,357,579 bytes, and framed SHA-256
`5b91f7f3ddcdf440a8ef22b7e43eec769402aa54c3f1995ee508adb0c9157882`.
All 278 declared TypeScript/TSX paths pass syntax construction, the eight
target-focused suites pass 86/86, and the retained 2.1.118 suites pass 21/21.
The complete generated/package claim and necessarily partial authored-source
localization remain separate.

The six later frozen recoveries through 2.1.126 are also complete. Their
release-local source targets remain pinned by their manifests. Shared main
uses a selective cumulative merge guarded by
`recovery/test/cumulative-2.1.126-merged-source-retention.test.mjs`; it is
intentionally not byte-identical to the frozen 2.1.126 `src` tree.

The 2.1.89 overlay modifies three files and adds one:

- `src/utils/bash/parser.ts`;
- `src/utils/bash/commands.ts`;
- `src/tools/BashTool/BashTool.tsx`; and
- `src/tools/BashTool/fileReadState.ts`.

On a verified 2.1.89 source tree, the incremental 2.1.90 overlay modifies
nine more files. Apply it in this order:

```sh
CASE=recovery/cases/2.1.89-to-2.1.90
git apply "$CASE/recovered/safety-and-cache.patch"
git apply "$CASE/recovered/sse-stream-buffering.patch"
git apply "$CASE/recovered/session-resume.patch"
git apply "$CASE/recovered/query-engine-transcript.patch"
git apply "$CASE/recovered/rate-limit-options.patch"
git apply "$CASE/recovered/help-powerup-hint.patch"
```

In a release-local replay, apply the 2.1.89 and 2.1.90 overlays before the
incremental 2.1.91 overlay, which applies in this order:

```sh
CASE=recovery/cases/2.1.90-to-2.1.91
git apply "$CASE/recovered/mcp-result-override.patch"
git apply "$CASE/recovered/skill-shell-policy.patch"
git apply "$CASE/recovered/multiline-deep-links.patch"
git apply "$CASE/recovered/plugin-bin-path.patch"
git apply "$CASE/recovered/transcript-chain-fallback.patch"
git apply "$CASE/recovered/input-permission-schema.patch"
git apply "$CASE/recovered/feedback-availability.patch"
git apply "$CASE/recovered/windows-rollback-cleanup.patch"
git apply "$CASE/recovered/edit-anchor-guidance.patch"
git apply "$CASE/recovered/claude-api-guidance.patch"
```

On that release-local verified 2.1.91 tree, the incremental 2.1.92 overlay
applies in this order:

```sh
CASE=recovery/cases/2.1.91-to-2.1.92
git apply "$CASE/recovered/startup-and-remote-settings.patch"
git apply "$CASE/recovered/prompt-hook-policy.patch"
git apply "$CASE/recovered/streamed-tool-input-coercion.patch"
git apply "$CASE/recovered/homebrew-cask-channel.patch"
git apply "$CASE/recovered/tmux-stable-window.patch"
git apply "$CASE/recovered/cursor-end-of-line.patch"
git apply "$CASE/recovered/release-notes-and-command-removals.patch"
```

The incremental 2.1.94 overlay advances directly from the verified 2.1.92
tree because there is no published 2.1.93 package. Its ordered, reversible
patch set is recorded by that case's `sourceLineage.patchOrder`.

The incremental 2.1.96 overlay advances directly from the verified 2.1.94
tree because there is no published 2.1.95 package:

```sh
CASE=recovery/cases/2.1.94-to-2.1.96
git apply "$CASE/recovered/bedrock-auth.patch"
```

It maps the Bedrock API-key regression repair to
`src/services/api/client.ts`. Two additional changed Bedrock probes live in
target-only generated modules with unobservable authored paths; their exact
runtime code remains covered by the bundle recovery and tests.

The incremental 2.1.97 overlay advances from the verified 2.1.96 tree:

```sh
CASE=recovery/cases/2.1.96-to-2.1.97
git apply "$CASE/recovered/statusline-and-runtime-hardening.patch"
```

It recovers defensible source placements for status-line worktree/refresh
data, retry/OAuth/permission hardening, edit-history and tool statistics,
Zellij/Warp terminal behavior, Cedar highlighting, and W3C trace propagation.
Other release changes remain exact in the published bundle recovery where
their authored placement is not observable.

The incremental 2.1.98 overlay advances from the verified 2.1.97 tree:

```sh
CASE=recovery/cases/2.1.97-to-2.1.98
git apply "$CASE/recovered/perforce-permissions-and-runtime.patch"
```

It recovers defensible source placements for Perforce read-only enforcement,
Bash permission hardening, LSP client identity, compact-disabled behavior,
and shifted uppercase input. Large target-only additions remain exact in the
published bundle recovery where their authored boundaries are unobservable.

The incremental 2.1.100 overlay advances directly from the verified 2.1.98
tree because there is no published 2.1.99 package:

```sh
CASE=recovery/cases/2.1.98-to-2.1.100
git apply "$CASE/recovered/thinking-progress-and-prompts.patch"
```

It recovers the 30-, 90-, and 270-second long-thinking notices, delays the
stalled-response color transition from 3 seconds to 10 seconds with a
10-second fade, and removes the obsolete output-efficiency prompt owner.
Experiment-only communication-style and numeric-length changes remain exact
in the published bundle layer because their preceding 2.1.98 authored
scaffolding is absent from this partial source lineage.

The incremental 2.1.101 overlay advances from the verified 2.1.100 tree:

```sh
CASE=recovery/cases/2.1.100-to-2.1.101
git apply "$CASE/recovered/security-resume-and-runtime.patch"
```

It recovers defensible source placements for OS CA trust selection,
shell-free executable lookup, Bedrock SigV4 header isolation, API refusal
details, retention safety, hook permission precedence, ripgrep self-healing,
resume-chain correctness, virtual-list retention, raw control keys, focus
guidance, and the expanded long-thinking cadence. Adjacent generated changes
without a defensible authored owner remain exact in the published bundle
recovery.

The incremental 2.1.104 overlay advances directly from the verified 2.1.101
tree because 2.1.102 and 2.1.103 were not published:

```sh
CASE=recovery/cases/2.1.101-to-2.1.104
git apply "$CASE/recovered/streaming-idle-and-partial-yield.patch"
```

It recovers the byte-level first-party SSE idle watchdog, event/byte timeout
telemetry tiers, and the guard that prevents non-streaming replay after
partial output. The gated prompt-heading rename remains exact in the bundle
layer because its experiment scaffold is absent from the readable source
mirror.

The incremental 2.1.105 overlay advances from the verified 2.1.104 tree:

```sh
CASE=recovery/cases/2.1.104-to-2.1.105
git apply "$CASE/recovered/source-facing-overlay.patch"
```

It recovers defensible owners for existing-worktree entry, blocking
PreCompact hooks, the default-on stream watchdog, WebFetch cleanup, visual
FileWrite truncation, immediate network retry messages, skill and keybinding
changes, cron cleanup safety, stdio MCP failure, and permission-downgrade
prevention. Broader plugin, marketplace, doctor, channel, managed-agent, and
UI changes remain exact at the published-bundle layer.

The incremental 2.1.107 overlay advances directly from the verified 2.1.105
tree because 2.1.106 was not published:

```sh
CASE=recovery/cases/2.1.105-to-2.1.107
git apply "$CASE/recovered/source-facing-overlay.patch"
```

It recovers the 10-, 30-, 50-, 80-, and 120-second long-thinking milestones,
plus the target-backed Opus 4.6 experiment gate, system-prompt guidance, and
hidden follow-up reminder. The generated/package layer remains the complete
claim; exact original TypeScript spelling is not observable.

The incremental 2.1.108 overlay advances directly from the verified 2.1.107
tree; both are published packages, so no version is skipped:

```sh
CASE=recovery/cases/2.1.107-to-2.1.108
git apply "$CASE/recovered/source-facing-overlay.patch"
```

It recovers defensible owners for Remote Control title preservation,
model-switch confirmation, bundled skill visibility, feedback and
prompt-caching UI, interactive resume and teleport errors, plugin-update
scope selection, API and prompt fixes, paste and highlighting behavior, and
shell, permission, and suggestion changes. The generated/package layer
remains the complete claim.

The incremental 2.1.109 overlay advances directly from the verified 2.1.108
tree; both are published packages, so no version is skipped:

```sh
CASE=recovery/cases/2.1.108-to-2.1.109
git apply "$CASE/recovered/source-facing-overlay.patch"
```

It adds the fourteen-step rotating extended-thinking indicator, renders it
through the message stream, resets response state, and removes the former
five-step REPL-local timer. The generated/package layer remains the complete
claim; exact original TypeScript spelling and the generated spinner-store
boundary are not observable.

The incremental 2.1.110 overlay advances directly from the verified 2.1.109
tree; both are published packages, so no version is skipped:

```sh
CASE=recovery/cases/2.1.109-to-2.1.110
git apply "$CASE/recovered/source-facing-overlay.patch"
```

It recovers defensible owners for the new TUI/focus controls, fullscreen and
editor behavior, plugin dependency and Installed-tab changes, MCP/API
hardening, scheduled-task resume, Remote Control, permissions/hooks, session
durability, and related runtime fixes. The provider setup-wizard relaunch
scaffold is absent from the source mirror, so its TTY-sever fix remains exact
only in the generated bundle and is explicitly source-partial.

The incremental 2.1.111 overlay advances directly from the verified 2.1.110
tree in npm publication order:

```sh
CASE=recovery/cases/2.1.110-to-2.1.111
git apply "$CASE/recovered/source-facing-overlay.patch"
```

It recovers defensible owners for Opus 4.7 and `xhigh` effort, the interactive
effort selector, terminal-aware themes, skills sorting, PowerShell and
read-only permission behavior, prompt-derived plan names, raw API-body
telemetry, the `/ultrareview` command, session/UI fixes, and adjacent
reliability repairs. The less-permission-prompts body is recovered exactly
from its target literal into the defensible bundled-skill owner. The
`/setup-vertex` and `/setup-bedrock` wizard changes remain exact only in the
generated bundle because their scaffold is absent from the cumulative mirror.
The ultrareview SDK handler is adapted to the mirror's existing task context;
the target's absent task-registry/cloud-environment owners remain exact only
in generated code, as documented in the case report.

The incremental 2.1.112 overlay advances directly from the verified 2.1.111
tree in npm publication order:

```sh
CASE=recovery/cases/2.1.111-to-2.1.112
git apply "$CASE/recovered/source-facing-overlay.patch"
```

It recovers a shared model-temperature capability and guards the main and
side-query request builders so canonical Opus 4.7 requests omit unsupported
explicit temperatures. The source-facing helper name is inferred because
minification erased its upstream spelling. A structured-output source gap
already present in the 2.1.111 mirror is explicitly excluded from this delta.

The recovered 2.1.113 source-facing overlay is frozen in its release-local
target. Its archived incremental patch remains the reversible base-to-target
record.

It localizes defensible owners for denied-domain sandbox configuration,
security and input hardening, Remote Control operations, MCP and async-agent
watchdogs, ToolSearch ranking, effort handling, OSC 8 links, and image-failure
degradation. The complete generated claim is the exact wrapper plus all three
plain JavaScript entries in the authenticated Linux x64 Bun graph. The native
executable, JSC cache, and addons are authenticated and range-verified, not
claimed as reconstructed authored source.

The recovered 2.1.114 source-facing overlay is frozen in its release-local
target. Its archived incremental patch remains the reversible base-to-target
record.

It localizes the permission-dialog crash fix backed by the exact adjacent
native CLI slices. The complete generated claim covers the exact seven-member
wrapper and all three plain JavaScript entries (12,991,971 bytes) in the
authenticated Linux x64 Bun graph. The target ELF, JSC cache, and native addons
are authenticated and range-verified, not reconstructed from the 2.1.113
source or presented as exact authored TypeScript.

The incremental 2.1.116 recovery advances directly from the verified 2.1.114
tree because 2.1.115 was not published. The archived patch records the
reversible transition; replay it only from that verified base:

```sh
CASE=recovery/cases/2.1.114-to-2.1.116
git apply "$CASE/recovered/source-facing-overlay.patch"
```

Its generated/package claim is complete: three exact wrapper-member payloads
reconstruct `install.cjs`, `package.json`, and `sdk-tools.d.ts`, while three
adjacent payloads reconstruct every plain JavaScript entry in the
authenticated Linux x64 Bun graph. The incremental source overlay is
source-facing and frozen in the release-local target. The frozen patch touches
56 paths and produces a target summary of 1,951 files, 30,923,332 bytes, and
framed SHA-256
`b1a90b5f154db24f709ab12afb2bc746ddc1e03ea07235d4880f099743ec58a4`.
Its three focused suites pass 15/15 in both the base and applied-target
orientations.

The incremental 2.1.117 recovery advances directly from the verified 2.1.116
tree in npm publication order. Its source-facing overlay is frozen in the
release-local target, and the archived patch records the reversible
transition. For a clean-room replay only, apply it from a verified 2.1.116
source base in a disposable checkout:

```sh
CASE=recovery/cases/2.1.116-to-2.1.117
git apply "$CASE/recovered/source-facing-overlay.patch"
```

Its generated/package claim is complete: one exact wrapper-member payload
recovers `package.json`, the other six wrapper members are unchanged, and
three adjacent payloads reconstruct every plain JavaScript entry in the
authenticated Linux x64 Bun graph. The target ELF, JSC cache, and native
addons are authenticated and range-verified, not presented as authored source.

The frozen source-facing patch is 637,321 bytes with SHA-256
`d2063694679f1a1e02d41c84bb375da029263e1feff9c1e457d66df979e21773`.
It records 123 paths (115 modified, seven added, one deleted), with 2,864
insertions and 856 deletions. Applying it produces 1,957 files, 30,993,723
bytes, and framed SHA-256
`135719f7be0cccc9e4658e0f7b78d46e52d947cc171a9bf80b36e1081d727cee`.
All 122 target-existing changed source paths pass syntax construction, and its
three focused test files pass 8/8 from both source-tree orientations.

All 30 checked-in recovery cases through target 2.1.126 are present. Treat
each archived overlay as release-local: verify it through its version-specific
wrapper in a disposable proof carrier, and do not reverse or reapply archived
overlays in shared main. Shared main's selective cumulative merge has its own
retention guard. The 2.1.121–2.1.126 top-level wrappers additionally pin the
exact proof-carrier commit and manifest, then construct a private target-source
carrier for every nested verifier. The 2.1.121 wrapper uses final proof commit
`4593ba568ee2e840e1a0e3fdfd3b2a9fa51d2d45` and materializes its target `src`
from the manifest-pinned Git object inside that private carrier.

## Quick verification

Follow the current frozen target's
[`2.1.126 runbook`](./cases/2.1.124-to-2.1.126/RECOVERY_RUNBOOK.md) in a
release-local carrier whose `src` matches the manifest's
`sourceLineage.targetSrcGitTree`. Install the pinned recovery dependencies and acquire the
manifest artifacts with:

```sh
pixi run npm --prefix recovery ci --ignore-scripts

RECOVERY_ARTIFACTS=$(mktemp -d)
pixi run node recovery/scripts/acquire-case.mjs \
  --case recovery/cases/2.1.124-to-2.1.126/manifest.json \
  --output "$RECOVERY_ARTIFACTS"
```

Do not run the frozen release wrapper against shared main: its selective
cumulative `src` intentionally differs from the frozen 2.1.126 tree. Validate
the merged source retention separately with authenticated adjacent bundles:

```sh
CLAUDE_CODE_2_1_124_BUNDLE="$RECOVERY_ARTIFACTS/2.1.124-linux-x64/cli.inner.js" \
CLAUDE_CODE_2_1_126_BUNDLE="$RECOVERY_ARTIFACTS/2.1.126-linux-x64/cli.inner.js" \
pixi run node --test \
  recovery/test/cumulative-2.1.126-merged-source-retention.test.mjs \
  recovery/test/recovery-2.1.126-retained-redraw.test.mjs \
  recovery/test/release-2.1.126-input-contract.test.mjs
```

## Inspect the diff

The compact structural diff is plain text:

```sh
less recovery/cases/2.1.124-to-2.1.126/readable-diff/statements.diff
```

The complete normalized Git diff is deterministically compressed:

```sh
gzip -cd \
  recovery/cases/2.1.124-to-2.1.126/readable-diff/normalized.diff.gz |
  less
```

This normalized diff is a comparison representation, not executable source.
Do not apply it to `src/`.

## Reusable method

Use these stages for another adjacent release pair. Case construction freezes
and derives evidence while the target artifacts are available; later recovery
replays the case delta, patches, and verifiers from those pinned inputs.

### 1. Freeze every artifact

Pin URLs, byte counts, cryptographic hashes, archive members, public
declarations, and release metadata. Never compare an unverified “latest”
artifact. If an artifact was withdrawn, record its authenticated digests and
require a user-supplied copy instead of pretending an unstable mirror is
canonical.

### 2. Separate adjacency from source ownership

Use the immediately previous exact bundle for reversible generated/package
comparison. Use only a genuinely matching bundle/map pair as the source
oracle. A mapped ancestor can inform ownership without being falsely applied
to adjacent offsets.

### 3. Prove and preserve both source layers

`extract-baseline.mjs` emits:

- `bun-input/`, the exact 4,756 outer build inputs; and
- `pristine/src/`, the human-facing originals recovered from nested TSX maps.

Use the outer layer for build and compiler-shape lineage. Prefer the pristine
layer for human-readable candidate edits when a nested original supports
them; retain the outer layer where the target evidence is only recoverable in
compiled shape.

### 4. Inventory the whole package

`compare-npm-tarballs.mjs` compares every archive member's path, type, mode,
link target, and uncompressed bytes. This prevents bundle analysis from
missing declaration, metadata, vendor, or removed-file changes.

### 5. Add an exact reversible delta

`build-exact-delta.mjs` uses the baseline bundle as a Zstandard dictionary,
then reconstructs and byte-compares the target. This is the completeness
backstop: readable inference never substitutes for the published bytes.
Package members absent from the baseline, or changed members that need a
separate dictionary patch, require hash-pinned exact payload recipes;
reconstruction rejects missing, duplicate, unused, or unsafe recipes.

### 6. Account for all generated offsets

`inventory-generated-change.mjs` decodes exact baseline ownership, uses
unique literals as sparse alignment evidence, inventories generated wrapper
regions, and partitions the entire target. Exact baseline source ownership
and evidence-ranked target attribution remain separate claims.

### 7. Classify all tokens conservatively

`account-generated-delta.mjs` parses top-level units, uses scope-normalized
token identity for exact matches, records move ambiguity, labels
identifier-insensitive pairs as candidates, and leaves unsupported pairings
unresolved. Every target token must appear exactly once in the ledger.

### 8. Generate a bounded readable view

`generate-readable-bundle-diff.mjs` derives Program-scope rename candidates
from unique structural pairs. It rejects collisions, nested captures,
non-bijective mappings, class dual bindings, and unresolved capture. It
emits a normalized full diff and proves a comparison invariant before and
after rewriting.

### 9. Recover and audit incremental source semantics

Map high-value changed regions back through baseline ownership, preserve
target operators/literals/call order/control flow, distinguish exact text
from inferred names/types, and add differential tests against evaluable
target helpers. Pin a unique target fragment for every claimed edit.

Reverse patches in reverse order and verify the complete predecessor tree;
then reapply them in order and byte-compare the complete successor tree.

For semantic completeness, also ledger every target structural unit not
classified as an exact match. Identifier/order-only equivalence, dependency
runtime, generated metadata, and DCE require direct evidence; reachable
first-party units require a historical source owner and target-backed semantic
test. Any `source-runtime-gap` fails the case until a case-local semantic
supplement fixes it.

### 10. Make the claims executable

Each output has byte/hash assertions and a dedicated verifier. The aggregate
gate must close:

- artifact identity;
- baseline provenance;
- package members;
- exact target reconstruction;
- byte and token accounting;
- readable-diff integrity;
- source patch application/syntax; and
- target-backed behavioral tests.

## Confidence vocabulary

- `exact`: directly preserved or byte-reconstructed artifact evidence;
- `equivalent`: observed behavior matches within explicit tests;
- `candidate`: bounded structural/source correspondence, not equivalence;
- `inferred`: readable choice for information erased by the build;
- `unresolved`: deliberately unpaired, but still present in the exact target;
- `unobservable`: information absent from the published artifact.

A byte-exact generated recovery, first-party semantic source recovery,
whole-bundle source build, and exact original authored text are four different
claims. Keeping them separate is the central safety property of this method.
