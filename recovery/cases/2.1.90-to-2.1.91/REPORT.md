# Claude Code 2.1.90 → 2.1.91 recovery report

## Result

The recoverable 2.1.91 release is complete at the published-code layer, and
the evidence-backed source overlay is applied to this repository.

- The authenticated 2.1.91 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.90 bundle and the case's 1,934,216-byte delta.
- The complete 18-member npm package tree reconstructs exactly. All
  43,103,342 unpacked member bytes and target modes match the published
  archive.
- Every one of the target bundle's 13,098,272 UTF-16 code units is covered by
  the attribution inventory.
- Every one of its 4,222,365 JavaScript tokens is classified as matched,
  moved, changed, or explicitly unresolved.
- The case includes a complete binding-aware bundle diff, compact statement
  diff, rename ledger, and 18 independently hashed target fragments.
- Ten reversible patches recover target-backed behavior in 21 existing source
  files and add the 27 published `/claude-api` guidance files. A separate
  executable model pins the dependency-generated Bun `stripANSI` change.
- The full source-lineage gate syntax-builds the 21 changed TypeScript files
  and passes 12 target-backed semantic tests.

The exact original 2.1.91 TypeScript tree is not uniquely recoverable.
Neither adjacent npm package publishes a source map, so types, comments,
formatting, many local names, and some module boundaries were erased. The
case is therefore labeled `generated-complete-source-partial`: the published
executable and package tree are exact, while source-facing TypeScript is
limited to behavior supported by target evidence.

The semantic source audit is complete under
`compiled-ast-function-semantics-v1`. Its fail-closed ledger covers all 3,113
changed, moved, and unresolved target structural units and reports zero
first-party `source-runtime-gap` rows. The historical target tree and current
`src/` therefore contain an equivalent owner for every reachable first-party
runtime behavior, without claiming the erased authored spelling or layout.

The final canonical semantic supplement contains 118 `src/` paths and
5,617,466 bytes, pinned by SHA-256
`8db899a471f6d4bc7c8ff22c42211643e725a29d7bfb484c3713def00086498b`.

That first-party verdict is not a whole-bundle source-build verdict. There
are 153 `dependency-runtime` gaps, and the historical release does not pin a
complete root application manifest/lockfile, dependency source archive, or
hermetic build recipe. The exact generated delta independently reconstructs
the published `cli.js` byte-for-byte.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, target SHA-256 `b4bf141f…` |
| Published package tree | Exact, 18 members and 43,103,342 bytes |
| Target generated offsets | Complete, 13,098,272 / 13,098,272 UTF-16 units |
| Target JavaScript tokens | Complete classification, 4,222,365 / 4,222,365 |
| Full readable bundle diff | Complete comparison view |
| First-party runtime semantics from source | Complete, 3,113 / 3,113 nonmatched units classified; 0 source gaps |
| Whole-bundle dependency/build inputs | Incomplete, 153 dependency runtime gaps plus missing hermetic inputs |
| Original authored 2.1.91 spelling | Partially unobservable |

## Baseline roles

This case keeps two baselines separate:

1. **2.1.90 is the adjacent generated baseline.** Exact delta, package,
   structural, and readable comparisons are all 2.1.90 → 2.1.91.
2. **2.1.88 is the source-ownership oracle.** Its matching bundle and source
   map identify baseline module ownership for attribution.

The 2.1.88 map is never applied to 2.1.90 or 2.1.91 offsets. The manifest
names the roles independently as `baselineBundle`, `sourceOracleBundle`, and
`sourceOracleMap`.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.90 npm tarball | 16,512,072 | `8e49c90ebaec565b5fb0af744bebc53c1fd36262453cb4f309c12f6127b55418` |
| 2.1.90 `cli.js` | 13,128,331 | `069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9` |
| 2.1.91 npm tarball | 16,522,495 | `4fb4dae771d6fad1e74703741148f5ee2d24837f4a04eab27041746f7a5b3e2b` |
| 2.1.91 `cli.js` | 13,162,543 | `b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 194,907 | `daaf0388d48da9026f513aef5ef93515a556cf43e1057b0d54fb6fd1a0bec111` |

Both npm tarballs were authenticated against registry SHA-1, SHA-512 SRI,
and ECDSA signatures under registry key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`. The exhaustive comparison
is stored in [`package-members.json`](./package-members.json).

The official changelog is pinned at commit
`1e03cc7fc40d9bab33f24855a8b5d31ba66205cb`; its 2.1.91 section has 13
entries. Release notes are localization evidence. Authenticated package bytes
remain the oracle.

## Package-member diff

The baseline has 19 members and the target has 18:

| Status | Members |
| --- | ---: |
| Unchanged | 15 |
| Changed | 3 |
| Added | 0 |
| Removed | 1 |

The four differences are exhaustive:

- `cli.js` grows by 34,212 bytes.
- `sdk-tools.d.ts` receives the exact nine-byte insertion `"auto" | ` in
  `PermissionMode`.
- `package.json` changes the version and adds an exact `files` whitelist.
- `bun.lock` is removed.

The exact reconstructed framed package-tree SHA-256 is:

```text
21a9edcea0cb4bb2ae36348c39f9e08c836e3476e96ae6f3d8a34c1a7aa35585
```

## Exact generated-code recovery

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is a deterministic
Zstandard dictionary patch:

| Input/output | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.90 baseline bundle | 13,128,331 | `069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9` |
| Delta | 1,934,216 | `2039573574ae6167b61b030212587cd842b698ccb91cec3cce2eba1988b7ee57` |
| Reconstructed 2.1.91 bundle | 13,162,543 | `b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816` |

The package reconstructor verifies the delta and compares every reconstructed
member with the authenticated target archive.

## Exhaustive generated-code accounting

The source oracle contains 4,756 sources and 2,068,722 mapped segments. The
attribution inventory records 4,559 target initializer regions and 43,354
target partitions. Partitions plus exact anchors account for all 13,098,272
target UTF-16 code units, leaving zero unaccounted.

The structural ledger classifies the complete target:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 15,216 | 3,481,458 |
| Moved candidate | 912 | 21,851 |
| Coarse changed candidate | 1,068 | 389,529 |
| Unresolved pairing | 1,133 | 329,527 |
| **Total** | **18,329** | **4,222,365** |

`unresolved` means the conservative matcher withheld a 2.1.90 pairing. Those
tokens are not missing: they remain in the exact target bundle, structural
ledger, and readable full-bundle diff.

## Readable full-bundle diff

[`readable-diff/normalized.diff.gz`](./readable-diff/normalized.diff.gz)
contains the full Git-style comparison after conservative Program-scope
binding alignment. It records:

- 12,607 structurally unique statement pairs;
- 17,702 accepted binding alignments;
- 92,709 identifier edits; and
- 4,461 rejected unsafe or ambiguous alignments.

The target comparison-invariant hash is identical before alpha rename, after
rename, and after statement normalization. This is a checked comparison
representation, not executable or authored source.

## Source-facing recovery

The incremental 2.1.91 source overlay recovers:

- MCP `_meta["anthropic/maxResultSizeChars"]` overrides, clamped to 500,000
  characters and carried through persistence and result mapping;
- `disableSkillShellExecution` across skills, custom commands, and plugin
  commands;
- encoded newlines and tabs in `claude-cli://open?q=` links;
- plugin `bin/` discovery and PATH propagation to Bash snapshots;
- transcript-chain fallback when an expected parent UUID is unavailable;
- `cmd+delete` handling and the `"auto"` permission mode in runtime and SDK
  schemas;
- an always-visible `/feedback` command with an unavailable explanation;
- protection of the active Windows version's rollback copy;
- shorter Edit-tool `old_string` guidance; and
- exact published `/claude-api` Markdown, including the new agent-design
  guidance.

The Bun `stripAnsi` optimization is dependency-generated output, so it is
preserved as an exact executable model rather than attributed to an invented
application source file.

The current `src/utils/plans.ts` already contains the target-observed remote
plan lookup behavior, and its compiled call sites are unchanged across the
adjacent bundles. The transcript fallback makes orphaned session records
reachable after interrupted writes. No unsupported plan patch was invented.

The incremental patch changes 21 existing files and adds 27 guidance files.
Its lineage is independently pinned:

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Recovered 2.1.90 base | 1,903 | 30,392,826 | `9be3f19a65aa46760fd3ababffefe74cc6eb1f81cb12b57bfb5e16662425ce25` |
| Applied 2.1.91 overlay | 1,930 | 30,661,962 | `5a74a719338766ab26023fc4041013bce9ff968356d152cb7df725bdab8a4108` |

`verify-source-lineage.mjs` reverse-applies all ten patches, proves the base
tree, reapplies them, and byte-compares the result with the repository. It
also syntax-builds all 21 changed TypeScript files and runs 12 focused tests.

## Verification

Acquire immutable evidence and run the aggregate gate:

```sh
CASE=recovery/cases/2.1.90-to-2.1.91
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.90/package.tgz"
```

Expected top-level status:

```text
complete-recovery-verified
```

The gate verifies evidence identity, the source oracle, all 18 target
fragments, bidirectional source lineage, syntax and semantic tests, exact
bundle reconstruction, complete attribution and structural accounting,
readable-diff invariants, and the exact reconstructed package tree.
