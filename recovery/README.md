# Claude Code release recovery

This directory contains an evidence-first, incremental method for recovering
later Claude Code releases from authenticated adjacent packages and the most
recent matching source-map oracle.

The checked-in cases are:

- [`2.1.88 → 2.1.89`](./cases/2.1.88-to-2.1.89/REPORT.md), the initial
  source-map-to-package recovery;
- [`2.1.89 → 2.1.90`](./cases/2.1.89-to-2.1.90/REPORT.md), the first
  adjacent incremental recovery;
- [`2.1.90 → 2.1.91`](./cases/2.1.90-to-2.1.91/REPORT.md), the second
  adjacent incremental recovery; and
- [`2.1.91 → 2.1.92`](./cases/2.1.91-to-2.1.92/REPORT.md), the current
  adjacent incremental recovery.

Each case has two simultaneous completeness levels that must not be
conflated:

- **generated/package complete**: the published target executable and package
  members reconstruct exactly, every generated offset is covered, and every
  JavaScript token is classified;
- **authored-source partial**: useful TypeScript patches and source
  attribution are recovered where the target supports them, but erased names,
  types, comments, formatting, and exact module placement are not observable.

For the current target, start with the
[`2.1.92 report`](./cases/2.1.91-to-2.1.92/REPORT.md),
[`manifest`](./cases/2.1.91-to-2.1.92/manifest.json), and
[`complete runbook`](./cases/2.1.91-to-2.1.92/RECOVERY_RUNBOOK.md).

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
and 2.1.92.
Those overlays are partial behavioral recoveries, not claims of the exact
authored TypeScript trees.

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

All four overlays are already present. Do not apply any overlay twice; the
complete gate reverse-checks the current increment and reapplies it in a
temporary copy.

## Quick verification

Install the two pinned JavaScript dependencies and acquire the manifest
artifacts:

```sh
pixi run npm --prefix recovery ci --ignore-scripts

RECOVERY_ARTIFACTS=$(mktemp -d)
pixi run node recovery/scripts/acquire-case.mjs \
  --case recovery/cases/2.1.91-to-2.1.92/manifest.json \
  --output "$RECOVERY_ARTIFACTS"
```

Run the complete gate:

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case recovery/cases/2.1.91-to-2.1.92/manifest.json \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.91/package.tgz"
```

It verifies the 2.1.88 source-oracle correspondence, current overlay lineage,
all case/output hashes, the source-like patches, exact bundle reconstruction,
attribution coverage, structural token accounting, readable-diff invariants,
target-backed tests, and exact package-tree reconstruction.

The expected top-level status is `complete-recovery-verified`, with exact
bundle SHA-256
`6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362`
and exact package-tree SHA-256
`e8abc7a21bab293650f17f5d3abd85b026132e6f53831c4c34499bd839ebe777`.

## Inspect the diff

The compact structural diff is plain text:

```sh
less recovery/cases/2.1.91-to-2.1.92/readable-diff/statements.diff
```

The complete normalized Git diff is deterministically compressed:

```sh
gzip -cd \
  recovery/cases/2.1.91-to-2.1.92/readable-diff/normalized.diff.gz |
  less
```

This normalized diff is a comparison representation, not executable source.
Do not apply it to `src/`.

The exact executable can be reconstructed directly:

```sh
pixi run zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.91/package/cli.js" \
  recovery/cases/2.1.91-to-2.1.92/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.92-cli.js
```

The reconstructed file must be 13,221,767 bytes with SHA-256
`6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362`.

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
Package members absent from the baseline require separate hash-pinned exact
payload recipes; reconstruction rejects missing, duplicate, unused, or unsafe
recipes.

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
