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
  adjacent incremental recovery; and
- [`2.1.111 → 2.1.112`](./cases/2.1.111-to-2.1.112/REPORT.md), the current
  seventeenth adjacent npm-package recovery. The 2.1.111 to 2.1.112 advance is
  direct in published-package order,
  with no skipped version. Upstream did not publish 2.1.93, 2.1.95, 2.1.99,
  2.1.102, 2.1.103, or 2.1.106, so each multi-number advance is still one step
  in published-release order.

Each case has two simultaneous completeness levels that must not be
conflated:

- **generated/package complete**: the published target executable and package
  members reconstruct exactly, every generated offset is covered, and every
  JavaScript token is classified;
- **authored-source partial**: useful TypeScript patches and source
  attribution are recovered where the target supports them, but erased names,
  types, comments, formatting, and exact module placement are not observable.

For the current target, start with the
[`2.1.112 report`](./cases/2.1.111-to-2.1.112/REPORT.md),
[`manifest`](./cases/2.1.111-to-2.1.112/manifest.json), and
[`complete runbook`](./cases/2.1.111-to-2.1.112/RECOVERY_RUNBOOK.md).

## Deliverables

| Deliverable | Purpose |
| --- | --- |
| `diff/cli.js.zstd-delta` | Exact, reversible adjacent bundle delta |
| `package-members.json` | Exhaustive npm member path/mode/byte comparison |
| `attribution/` | Complete target generated-offset and source-candidate inventory |
| `structural/` | Complete target token/unit classification ledger |
| `readable-diff/` | Binding-aware full bundle diff, structural diff, and rename map |
| `recovered/` | Target-backed source-facing patches and executable models |

## Current source-tree state

The repository `src/` is the verified 2.1.88 outer/Bun-input source-map
baseline plus cumulative source-facing overlays for 2.1.89, 2.1.90, 2.1.91,
2.1.92, 2.1.94, 2.1.96, 2.1.97, 2.1.98, 2.1.100, 2.1.101, 2.1.104, 2.1.105,
2.1.107, 2.1.108, 2.1.109, 2.1.110, 2.1.111, and 2.1.112.
Upstream skipped 2.1.93, 2.1.95, 2.1.99, 2.1.102, 2.1.103, and 2.1.106. Those
overlays are partial behavioral recoveries, not claims of the exact authored
TypeScript trees.

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

All eighteen overlays are already present. Do not apply any overlay twice; the
complete gate reverse-checks the current increment and reapplies it in a
temporary copy.

## Quick verification

Install the two pinned JavaScript dependencies and acquire the manifest
artifacts:

```sh
pixi run npm --prefix recovery ci --ignore-scripts

RECOVERY_ARTIFACTS=$(mktemp -d)
pixi run node recovery/scripts/acquire-case.mjs \
  --case recovery/cases/2.1.111-to-2.1.112/manifest.json \
  --output "$RECOVERY_ARTIFACTS"
```

Run the complete gate:

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case recovery/cases/2.1.111-to-2.1.112/manifest.json \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.111/package.tgz"
```

It verifies the 2.1.88 source-oracle correspondence, current overlay lineage,
all case/output hashes, the source-like patches, exact bundle reconstruction,
attribution coverage, structural token accounting, readable-diff invariants,
target-backed tests, and exact package-tree reconstruction.

The expected top-level status is `complete-recovery-verified`, with exact
bundle SHA-256
`bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f`
and exact package-tree SHA-256
`938bdf827e5fa7181cff5360cb2f028447cf865bd26c129d1edbcaa8af377fac`.

## Inspect the diff

The compact structural diff is plain text:

```sh
less recovery/cases/2.1.111-to-2.1.112/readable-diff/statements.diff
```

The complete normalized Git diff is deterministically compressed:

```sh
gzip -cd \
  recovery/cases/2.1.111-to-2.1.112/readable-diff/normalized.diff.gz |
  less
```

This normalized diff is a comparison representation, not executable source.
Do not apply it to `src/`.

The exact executable can be reconstructed directly:

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.111/package/cli.js" \
  recovery/cases/2.1.111-to-2.1.112/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.112-cli.js
```

The reconstructed file must be 13,711,684 bytes with SHA-256
`bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f`.

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
