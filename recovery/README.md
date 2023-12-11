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
  adjacent recovery; and
- [`2.1.116 → 2.1.117`](./cases/2.1.116-to-2.1.117/REPORT.md), the twenty-first
  adjacent recovery; and
- [`2.1.117 → 2.1.118`](./cases/2.1.117-to-2.1.118/REPORT.md), the current
  twenty-second adjacent recovery. Upstream did not publish 2.1.93, 2.1.95,
  2.1.99, 2.1.102, 2.1.103, 2.1.106, or 2.1.115, so every multi-number advance
  is still one step in published-release order.

Each case has simultaneous completeness levels that must not be conflated:

- **generated/package complete**: the target wrapper and generated JavaScript
  reconstruct exactly, every generated offset is covered, and every
  JavaScript token is classified;
- **native authenticated**: from 2.1.113 onward, the selected signed platform
  executable and its Bun/JSC/native ranges are authenticated and independently
  verified; the executable is not falsely presented as reconstructed source;
- **authored-source partial**: useful TypeScript patches and source
  attribution are recovered where the target supports them, but erased names,
  types, comments, formatting, and exact module placement are not observable.

For the current target, start with the
[`2.1.118 report`](./cases/2.1.117-to-2.1.118/REPORT.md),
[`manifest`](./cases/2.1.117-to-2.1.118/manifest.json), and
[`complete runbook`](./cases/2.1.117-to-2.1.118/RECOVERY_RUNBOOK.md).

## Deliverables

| Deliverable | Purpose |
| --- | --- |
| `binary-extraction/` | Bun graph discovery, canonical ranges, and independent verification |
| `diff/` | Exact embedded-JavaScript and wrapper recovery payloads |
| `package-members.json` | Exhaustive npm member path/mode/byte comparison |
| `attribution/` | Complete target generated-offset and source-candidate inventory |
| `structural/` | Complete target token/unit classification ledger |
| `readable-diff/` | Binding-aware full bundle diff, structural diff, and rename map |
| `recovered/` | Target-backed source-facing patches and executable models |

## Current source-tree state

The repository `src/` is the verified 2.1.88 outer/Bun-input source-map
baseline plus cumulative source-facing overlays for 2.1.89, 2.1.90, 2.1.91,
2.1.92, 2.1.94, 2.1.96, 2.1.97, 2.1.98, 2.1.100, 2.1.101, 2.1.104, 2.1.105,
2.1.107, 2.1.108, 2.1.109, 2.1.110, 2.1.111, 2.1.112, 2.1.113, 2.1.114,
2.1.116, 2.1.117, and 2.1.118.
Upstream skipped 2.1.93, 2.1.95, 2.1.99, 2.1.102, 2.1.103, 2.1.106, and
2.1.115.
Those overlays are partial behavioral recoveries, not claims of the exact
authored TypeScript trees.

The 2.1.114 exact wrapper and embedded-JavaScript recovery is complete. Its
source-facing overlay is applied, so the repository `src/` carries the
verified 2.1.114-facing target as its twentieth recovered overlay. This does
not make the target's original authored TypeScript exactly observable.

The 2.1.116 exact wrapper and embedded-JavaScript recovery is also complete.
Its incremental source-facing overlay is applied, so the checked-out `src/`
tree carries the cumulative 2.1.116-facing target as its twenty-first recovered
overlay. Version 2.1.115 was not published. The exact generated recovery and
the necessarily partial authored-source localization remain separate claims.

The 2.1.117 exact wrapper and embedded-JavaScript recovery is complete. Its
incremental source-facing overlay is applied, so the checked-out `src/` tree
carries the cumulative 2.1.117-facing target as its twenty-second recovered
overlay. The frozen patch touches 123 paths and produces 1,957 files,
30,993,723 bytes, and framed SHA-256
`135719f7be0cccc9e4658e0f7b78d46e52d947cc171a9bf80b36e1081d727cee`.
All 122 target-existing changed source paths pass syntax construction, and the
three focused test files pass 8/8 in both base and applied-target orientations.
The complete generated/package claim and necessarily partial authored-source
localization remain separate.

The 2.1.118 exact wrapper and embedded-JavaScript recovery is complete. Its
incremental source-facing overlay is frozen and applied in the shared
checkout, so `src/` carries the cumulative 2.1.118-facing target.
The patch records 306 paths (241 modified and 65 added), with 21,736 insertions
and 3,261 deletions. It produces 2,022 files,
31,570,676 bytes, and framed SHA-256
`c91ebcc114cbe577e4ffe43801e6014ade8e26d27271f57b0af1ce8ce9ff3d59`.
All 280 declared TypeScript/TSX paths pass syntax construction, and the four
focused suites pass 21/21 in both source orientations. The complete
generated/package claim and necessarily partial authored-source localization
remain separate.

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

The 2.1.89 and 2.1.90 overlays are already present in this working tree. On
the resulting verified 2.1.90 tree, the incremental 2.1.91 overlay applies in
this order:

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

These patches are also already present. On that verified 2.1.91 tree, the
incremental 2.1.92 overlay applies in this order:

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

The recovered 2.1.113 source-facing overlay is now applied. Its archived
incremental patch remains the reversible base-to-target record.

It localizes defensible owners for denied-domain sandbox configuration,
security and input hardening, Remote Control operations, MCP and async-agent
watchdogs, ToolSearch ranking, effort handling, OSC 8 links, and image-failure
degradation. The complete generated claim is the exact wrapper plus all three
plain JavaScript entries in the authenticated Linux x64 Bun graph. The native
executable, JSC cache, and addons are authenticated and range-verified, not
claimed as reconstructed authored source.

The recovered 2.1.114 source-facing overlay is now applied. Its archived
incremental patch remains the reversible base-to-target record.

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
source-facing and is applied in the checked-out tree. The frozen patch touches
56 paths and produces a target summary of 1,951 files, 30,923,332 bytes, and
framed SHA-256
`b1a90b5f154db24f709ab12afb2bc746ddc1e03ea07235d4880f099743ec58a4`.
Its three focused suites pass 15/15 in both the base and applied-target
orientations.

The incremental 2.1.117 recovery advances directly from the verified 2.1.116
tree in npm publication order. Its source-facing overlay is applied in the
checked-out tree, and the archived patch records the reversible transition.
Do not apply it a second time. For a clean-room replay only, apply it from a
verified 2.1.116 source base in a disposable checkout:

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

All twenty-three overlays through 2.1.118 are present and applied. Do not apply
an overlay twice. Reverse only the final 2.1.118 overlay for a deliberate
reversibility audit, and reapply it before continuing so the audit ends at the
2.1.118 target. Never reverse a cumulative pre-2.1.117 overlay.

## Quick verification

Install the two pinned JavaScript dependencies and acquire the manifest
artifacts:

```sh
pixi run npm --prefix recovery ci --ignore-scripts

RECOVERY_ARTIFACTS=$(mktemp -d)
pixi run node recovery/scripts/acquire-case.mjs \
  --case recovery/cases/2.1.117-to-2.1.118/manifest.json \
  --output "$RECOVERY_ARTIFACTS"
```

Run the complete gate directly against the checked-out, applied 2.1.118
target:

```sh
CASE=recovery/cases/2.1.117-to-2.1.118
git diff --exit-code -- src
git diff --cached --exit-code -- src
git apply --reverse --check "$CASE/recovered/source-facing-overlay.patch"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.117/package.tgz"
```

It verifies the 2.1.88 source-oracle correspondence, Bun container and raw
ranges, target overlay lineage, all case/output hashes, exact embedded-code
and wrapper reconstruction, attribution coverage, structural token accounting,
readable-diff invariants, and target-backed tests.

The source-lineage gate reverses and reapplies the patch inside its own
temporary workspace, so the checked-out tree remains at 2.1.118. For an
optional manual reversibility audit, reverse only this case's patch, verify the
2.1.117 base, and immediately reapply it so the audit ends at 2.1.118:

```sh
git apply --reverse --check "$CASE/recovered/source-facing-overlay.patch"
git apply --reverse "$CASE/recovered/source-facing-overlay.patch"
# Require: 1,957 files, 30,993,723 bytes, framed SHA-256
# 135719f7be0cccc9e4658e0f7b78d46e52d947cc171a9bf80b36e1081d727cee.
git apply --check "$CASE/recovered/source-facing-overlay.patch"
git apply "$CASE/recovered/source-facing-overlay.patch"
# Require: 2,022 files, 31,570,676 bytes, framed SHA-256
# c91ebcc114cbe577e4ffe43801e6014ade8e26d27271f57b0af1ce8ce9ff3d59.
git diff --exit-code -- src
git diff --cached --exit-code -- src
```

The expected top-level status is `complete-recovery-verified`, with exact
raw embedded CLI SHA-256
`fbf6347d8ba29bfd37c48471e77e635180918e45be61ec8c49cfacd70ffb37ba`
and exact wrapper-tree SHA-256
`72c0c29d2bf08d2309560c7496ae91a2c1282b2f452ec484114f971d67a99094`.
The exact target Bun graph contains three embedded plain JavaScript files and
13,239,834 bytes.

## Inspect the diff

The compact structural diff is plain text:

```sh
less recovery/cases/2.1.117-to-2.1.118/readable-diff/statements.diff
```

The complete normalized Git diff is deterministically compressed:

```sh
gzip -cd \
  recovery/cases/2.1.117-to-2.1.118/readable-diff/normalized.diff.gz |
  less
```

This normalized diff is a comparison representation, not executable source.
Do not apply it to `src/`.

The exact embedded CLI entry can be reconstructed directly:

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.117-linux-x64/cli.js" \
  recovery/cases/2.1.117-to-2.1.118/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.118-embedded-cli.js
```

The baseline is the canonical 2.1.117 CLI slice from its authenticated native
executable. The reconstructed file must be 13,234,708 bytes with SHA-256
`fbf6347d8ba29bfd37c48471e77e635180918e45be61ec8c49cfacd70ffb37ba`.

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

### 9. Recover incremental source-facing edits

Map high-value changed regions back through baseline ownership, preserve
target operators/literals/call order/control flow, distinguish exact text
from inferred names/types, and add differential tests against evaluable
target helpers. Pin a unique target fragment for every claimed edit.

Reverse patches in reverse order and verify the complete predecessor tree;
then reapply them in order and byte-compare the complete successor tree.

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

A complete generated recovery can coexist with a partial authored-source
recovery. That distinction is the central safety property of this method.
