# Claude Code 2.1.96 → 2.1.97 recovery report

## Result

The recoverable Claude Code 2.1.97 release is complete at the published-code
layer.

- The authenticated 2.1.97 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.96 bundle and the case's exact Zstandard dictionary
  delta.
- The complete 20-member npm package tree reconstructs exactly. All
  48,991,994 unpacked member bytes, paths, types, and modes match the
  authenticated target archive.
- Seventeen members are byte-identical. The exhaustive changed set is
  `cli.js`, the version-only `package.json`, and `sdk-tools.d.ts`.
- Two ordered, unique text edits reconstruct `sdk-tools.d.ts` exactly: the
  optional subagent `toolStats` object is inserted and
  `originalFile: string` becomes `string | null`.
- Every one of the target bundle's 13,310,031 UTF-16 code units is covered by
  the attribution inventory.
- Every one of its 4,257,140 JavaScript tokens is classified.
- The binding-aware readable comparison covers the complete bundle.
- A reversible, target-backed source-facing overlay advances the repository
  from its verified 2.1.96 source state to the recovered 2.1.97 state.

The exact original 2.1.97 TypeScript tree is not uniquely recoverable.
Neither adjacent package contains a source map. Names, types, comments,
formatting, and some authored module boundaries were erased by the build.
The case is therefore labeled `generated-complete-source-partial`: the
published executable and package tree are exact, while TypeScript changes are
applied only where the generated target supports a defensible placement.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, target SHA-256 `4c0b8a21…b988` |
| Published package tree | Exact, 20 members and 48,991,994 bytes |
| Public declarations | Exact replay from two ordered edits |
| Target generated offsets | Complete, 13,310,031 / 13,310,031 UTF-16 units |
| Target JavaScript tokens | Complete classification, 4,257,140 / 4,257,140 |
| Full readable bundle diff | Complete comparison view |
| Incremental repository source | Partial, one reversible patch on 21 paths |
| Original authored 2.1.97 spelling | Partially unobservable |

## Published-version adjacency

`2.1.97` is the next published npm version after `2.1.96`. The target was
published at `2026-04-08T21:27:55.556Z`. The official lightweight GitHub tag
`v2.1.97` resolves to commit
`22fdf68049e8c24e5a36087bb742857d3d5e407d`, and the changelog pinned at that
commit advances directly from 2.1.97 to 2.1.96.

All exact deltas, member comparisons, structural pairings, and readable
comparisons are therefore directly 2.1.96 → 2.1.97.

## Baseline roles

This case keeps two baselines separate:

1. **2.1.96 is the adjacent generated baseline.** Exact bundle, declaration,
   package, structural, and readable comparisons are all 2.1.96 → 2.1.97.
2. **2.1.88 is the source-ownership oracle.** Its matching bundle and source
   map identify exact baseline ownership for attribution.

The 2.1.88 map is never applied directly to 2.1.96 or 2.1.97 offsets.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.96 npm tarball | 18,527,078 | `46d70278ea9ac6a8f9c0b772a562c7b90be00a11caa9ba006bc99fbc3a88de58` |
| 2.1.96 `cli.js` | 13,308,470 | `62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e` |
| 2.1.97 npm tarball | 18,546,637 | `59df8e883edd0925bcb73407f974d0138c39106b744b8e6453ff23e3154b9a8a` |
| 2.1.97 `cli.js` | 13,375,388 | `4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988` |
| 2.1.97 `sdk-tools.d.ts` | 117,378 | `9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 206,008 | `6e873b1e818688bcb1d19f9058bcfaf0c36bda1705ce8b0e1f1bc342f36a26be` |

Both npm tarballs pass their registry SHA-1, SHA-512 SRI, and ECDSA P-256
signature checks under registry key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`. The key's SPKI SHA-256 is
`fb190a462123443500cbcdb6519623e7179e9f38d84ad4e9362b72d2b68b62c1`.
The exhaustive result is stored in
[`package-members.json`](./package-members.json).

The pinned changelog has one 2.1.97 section with 46 bullets. It is release
evidence, not a substitute for bundle or package comparison.

## Package-member diff

| Status | Members |
| --- | ---: |
| Unchanged | 17 |
| Changed | 3 |
| Added | 0 |
| Removed | 0 |
| Mode-only changed | 0 |

The changed set is exhaustive:

- `package/cli.js` grows by 66,918 bytes.
- `package/package.json` changes only the version from 2.1.96 to 2.1.97.
- `package/sdk-tools.d.ts` grows by 240 bytes through two exact edits.

Every native executable, seccomp helper, ripgrep binary, license, and readme
is byte-identical. The exact target package-tree SHA-256 is:

```text
c616574993d24d0d99db6597dac55c7b03074d7b3134ae1aa91f1dfff48c189c
```

## Exact generated-code recovery

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is a deterministic
Zstandard dictionary patch:

| Input/output | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.96 baseline bundle | 13,308,470 | `62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e` |
| Delta | 2,389,730 | `98f02e8e2ab14afc0e2d68db5939072b5ef363b8adb7b6a087deb2a5d8a3a57c` |
| Reconstructed 2.1.97 bundle | 13,375,388 | `4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988` |

The package reconstructor applies that delta, uniquely changes the package
version, replays the declaration edits, copies the 17 unchanged members with
their target modes, and compares all 20 outputs with the authenticated target.

## Exact declaration recovery

The manifest's `targetAssertions.declarationExactEdits` is executable
evidence. It:

1. uniquely inserts the optional seven-counter `toolStats` object into the
   completed Agent output; and
2. uniquely replaces `originalFile: string` with
   `originalFile: string | null`.

The shared replay helper requires each anchor to occur exactly once in the
baseline, requires baseline order, rejects overlap and no-op edits, and
compares the entire reconstructed declaration file with the target.

The checked-in 113-byte
[`sdk-tools.d.ts.zstd-delta`](./diff/sdk-tools.d.ts.zstd-delta) is an
independent exact cross-check. The text recipe remains authoritative so the
public API change is inspectable.

## Exhaustive generated-code accounting

The source oracle contains 4,756 sources and 2,068,722 mapped segments. The
attribution inventory records 4,576 target initializer regions and 40,110
target partitions. Partitions plus exact anchors cover all 13,310,031 target
UTF-16 code units, leaving zero unaccounted.

The structural ledger classifies every target token:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 14,120 | 3,271,381 |
| Moved candidate | 1,884 | 136,686 |
| Coarse changed candidate | 1,083 | 376,613 |
| Unresolved pairing | 1,483 | 472,460 |
| **Total** | **18,570** | **4,257,140** |

`unresolved` means the conservative matcher withheld a 2.1.96 pairing. Those
tokens are still present in the exact bundle, structural ledger, and readable
full-bundle diff.

## Readable full-bundle diff

[`readable-diff/normalized.diff.gz`](./readable-diff/normalized.diff.gz)
contains the complete Git-style comparison after conservative Program-scope
binding alignment. It records:

- 12,549 structurally unique statement pairs;
- 16,574 accepted binding alignments;
- 90,396 identifier edits; and
- 5,494 rejected unsafe alignments.

The target comparison-invariant hash is identical before alpha rename, after
rename, and after statement normalization. This is a checked comparison
representation, not executable or authored source.

## Source-facing recovery

The consolidated reversible patch is
[`recovered/statusline-and-runtime-hardening.patch`](./recovered/statusline-and-runtime-hardening.patch).
Its high-confidence clusters are:

- periodic status-line refresh and linked-worktree metadata;
- `Retry-After` as an exponential-backoff floor;
- configured MCP OAuth metadata discovery after restart;
- prototype-safe legacy tool-name lookup;
- nullable/capped stored pre-edit file content;
- nested subagent tool counts and edit diffstats;
- Zellij-safe DECSTBM rendering without disabling synchronized writes;
- Warp extended-key support;
- Cedar grammar registration in CLI and structured-diff highlighting; and
- W3C `TRACEPARENT` propagation into Bash subprocesses.

The source patch changes 19 existing paths and adds two Cedar language
modules. Nineteen exact target fragments bind these behaviors to the
authenticated bundle. Two focused test files exercise the source shape and
the corresponding baseline/target bundle delimiters.

The Bedrock empty-string correction described by the release notes occurs in
the embedded Anthropic SDK's environment reader. It remains exact in the
bundle delta and is not misattributed to an unchanged application source
path. Other 2.1.97 changes without a uniquely defensible authored placement
likewise remain exact at the published bundle layer.

The source lineage is independently pinned:

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Recovered 2.1.96 base | 1,931 | 30,687,527 | `2485f83f856b3b49188d0c1ca6125dec64959240ce149291306926cb1deed717` |
| Applied 2.1.97 overlay | 1,933 | 30,696,402 | `62292e92d77b622cf5290282387921c1464a35d8bac8b1d7c312d7bd03a0c289` |

The lineage gate reverse-applies the patch to reproduce the exact 2.1.96
tree, reapplies it, byte-compares the result with the repository, Bun-builds
all 21 changed source paths, and runs eight target-backed semantic tests.

## Verification

Acquire immutable evidence and run the aggregate gate:

```sh
CASE=recovery/cases/2.1.96-to-2.1.97
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.96/package.tgz"
```

Expected top-level status:

```text
complete-recovery-verified
```

The gate verifies evidence identity, the source-oracle topology, both exact
declaration edits, all 19 target fragments, bidirectional source lineage,
syntax and semantic tests, exact bundle reconstruction, complete attribution
and structural accounting, readable-diff invariants, and the exact 20-member
package tree. With every later-release bundle supplied to its target-backed
tests, the repository-wide recovery suite passes all 122 tests with no skips.
