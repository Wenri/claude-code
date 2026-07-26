# Claude Code release recovery

This directory contains an evidence-first method for recovering a later
Claude Code release from a readable, source-mapped baseline.

The 2.1.88 → 2.1.89 case reaches two different completeness levels that must
not be conflated:

- **generated/package complete**: the published 2.1.89 executable and all 19
  package members reconstruct exactly, every generated offset is covered, and
  every JavaScript token is classified;
- **authored-source partial**: useful TypeScript patches and source
  attribution are recovered where the target supports them, but erased names,
  types, comments, formatting, and exact module placement are not observable.

Start with the
[`case report`](./cases/2.1.88-to-2.1.89/REPORT.md) and
[`manifest`](./cases/2.1.88-to-2.1.89/manifest.json).

## Deliverables

| Deliverable | Purpose |
| --- | --- |
| `diff/cli.js.zstd-delta` | Exact, reversible 2.1.88 → 2.1.89 bundle delta |
| `package-members.json` | Exhaustive npm member path/mode/byte comparison |
| `attribution/` | Complete target generated-offset and source-candidate inventory |
| `structural/` | Complete target token/unit classification ledger |
| `readable-diff/` | Binding-aware full bundle diff, structural diff, and rename map |
| `recovered/` | Readable source-facing declaration and Bash/parser patches |

## Quick verification

Install the two pinned JavaScript dependencies and acquire the manifest
artifacts:

```sh
pixi run npm --prefix recovery ci --ignore-scripts

RECOVERY_ARTIFACTS=$(mktemp -d)
pixi run node recovery/scripts/acquire-case.mjs \
  --case recovery/cases/2.1.88-to-2.1.89/manifest.json \
  --output "$RECOVERY_ARTIFACTS"
```

The original 2.1.88 npm tarball was withdrawn. Whole-package reconstruction
therefore takes a user-supplied copy and rejects it unless it is exactly
31,196,633 bytes with SHA-256
`d836a86d9150ecc594a7025524c50e24080478904c979f386d447770275ef813`.
Its npm SHA-1, SHA-512 SRI, and registry signature are pinned in the package
report and manifest.

Run the complete gate:

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case recovery/cases/2.1.88-to-2.1.89/manifest.json \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball /path/to/claude-code-2.1.88.tgz
```

It verifies the repository/source-map correspondence, all case/output hashes,
the source-like patches, exact bundle reconstruction, attribution coverage,
structural token accounting, readable-diff invariants, target-backed tests,
and exact package-tree reconstruction.

The expected top-level status is `complete-recovery-verified`.

## Inspect the diff

The compact structural diff is plain text:

```sh
less recovery/cases/2.1.88-to-2.1.89/readable-diff/statements.diff
```

The complete normalized Git diff is deterministically compressed:

```sh
gzip -cd \
  recovery/cases/2.1.88-to-2.1.89/readable-diff/normalized.diff.gz |
  less
```

The exact executable can be reconstructed directly:

```sh
zstd -d \
  --patch-from="$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  recovery/cases/2.1.88-to-2.1.89/diff/cli.js.zstd-delta \
  -o /tmp/claude-code-2.1.89-cli.js
```

The reconstructed file must be 13,081,065 bytes with SHA-256
`a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01`.

## Reusable method

Use these stages for another adjacent release pair.

### 1. Freeze every artifact

Pin URLs, byte counts, cryptographic hashes, archive members, public
declarations, and release metadata. Never compare an unverified “latest”
artifact. If an artifact was withdrawn, record its authenticated digests and
require a user-supplied copy instead of pretending an unstable mirror is
canonical.

### 2. Prove the readable baseline

Verify the bundle/map pair, decode every mapping segment, compare every
application `sourcesContent` entry with the repository, reject missing or
extra repository files, and decode nested inline maps. This case proves all
1,902 application sources against 2,068,722 mapped segments.

### 3. Preserve both source layers

`extract-baseline.mjs` emits:

- `bun-input/`, the exact 4,756 outer build inputs; and
- `pristine/src/`, the human-facing originals recovered from nested TSX maps.

Use the first for build-layer correspondence and the second for readable
patches.

### 4. Inventory the whole package

`compare-npm-tarballs.mjs` compares every archive member's path, type, mode,
link target, and uncompressed bytes. This prevents bundle analysis from
missing declaration, metadata, vendor, or removed-file changes.

### 5. Add an exact reversible delta

`build-exact-delta.mjs` uses the baseline bundle as a Zstandard dictionary,
then reconstructs and byte-compares the target. This is the completeness
backstop: readable inference never substitutes for the published bytes.

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

### 9. Recover source-facing edits

Map high-value changed regions back through baseline ownership, preserve
target operators/literals/call order/control flow, distinguish exact text
from inferred names/types, and add differential tests against evaluable
target helpers.

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
