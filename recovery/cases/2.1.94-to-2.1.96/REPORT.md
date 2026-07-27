# Claude Code 2.1.94 → 2.1.96 recovery report

## Result

The recoverable Claude Code 2.1.96 release is complete at the published-code
layer. Upstream did not publish 2.1.95, so 2.1.94 is the immediately preceding
published package.

- The authenticated 2.1.96 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.94 bundle and the case's 319,590-byte exact delta.
- The complete 20-member npm package tree reconstructs exactly. All
  48,924,836 unpacked member bytes, paths, types, and modes match the
  authenticated target archive.
- Eighteen package members are byte-identical. Only `cli.js` and the
  version-only `package.json` change; declarations and every vendor binary
  are unchanged.
- Every one of the target bundle's 13,244,035 UTF-16 code units is covered by
  the attribution inventory.
- Every one of its 4,266,673 JavaScript tokens is classified as matched or
  explicitly unresolved.
- The case includes a binding-aware complete bundle diff, compact statement
  diff, and rename ledger.
- The reversible source-facing overlay modifies one uniquely mapped path,
  `src/services/api/client.ts`. It passes a Bun syntax build and three
  target-backed semantic tests.

The exact original 2.1.96 TypeScript tree is not uniquely recoverable.
Neither adjacent package provides a source map. Two of the three changed
Bedrock call sites live in target-only modules absent from both the 2.1.88
source oracle and the current source tree, so their original filenames and
module boundaries are unobservable. Their runtime bytes remain exact in the
bundle recovery and are covered by target-fragment assertions and tests.

The case is therefore labeled `generated-complete-source-partial`: the
published executable and package tree are exact, while source-facing
TypeScript is limited to behavior with a defensible authored placement.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, target SHA-256 `62ad81e3…d66e` |
| Published package tree | Exact, 20 members and 48,924,836 bytes |
| Target generated offsets | Complete, 13,244,035 / 13,244,035 UTF-16 units |
| Target JavaScript tokens | Complete classification, 4,266,673 / 4,266,673 |
| Full readable bundle diff | Complete comparison view |
| Incremental repository source | Partial, one reversible patch on one path |
| Original authored 2.1.96 spelling | Partially unobservable |

## Published-version adjacency

The exact npm lookup for `@anthropic-ai/claude-code@2.1.95` returns 404. The
full registry packument contains neither a `versions["2.1.95"]` entry nor a
`time["2.1.95"]` entry. The official GitHub repository likewise has no
`v2.1.95` tag, while `v2.1.96` resolves to commit
`227817d0f2cae5536273e78422c49bb89af859ca`. The changelog pinned at that
commit advances directly from 2.1.96 to 2.1.94.

```text
2.1.94  immediately preceding published package
2.1.95  not published by upstream
2.1.96  target published package
```

No intermediate archive is invented. Every exact delta, package-member
comparison, structural pairing, and readable comparison is directly
2.1.94 → 2.1.96.

## Baseline roles

This case keeps two baselines separate:

1. **2.1.94 is the adjacent generated baseline.** Exact delta, package,
   structural, and readable comparisons are all 2.1.94 → 2.1.96.
2. **2.1.88 is the source-ownership oracle.** Its matching bundle and source
   map identify mapped module ownership for attribution.

The 2.1.88 map is never applied directly to 2.1.94 or 2.1.96 offsets.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.94 npm tarball | 18,527,047 | `14a2aa53b5227d165f629bcad120c13fc09728168445c95e95641d62c4b00382` |
| 2.1.94 `cli.js` | 13,308,322 | `11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564` |
| 2.1.96 npm tarball | 18,527,078 | `46d70278ea9ac6a8f9c0b772a562c7b90be00a11caa9ba006bc99fbc3a88de58` |
| 2.1.96 `cli.js` | 13,308,470 | `62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 200,768 | `c5bec885de21aedb4b09a497e9776e60dce031ee68d614a7a208bea657b8b566` |

Both npm tarballs are authenticated against registry SHA-1, SHA-512 SRI, and
ECDSA signatures under registry key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`. The key's SPKI SHA-256 is
`fb190a462123443500cbcdb6519623e7179e9f38d84ad4e9362b72d2b68b62c1`.
The exhaustive result is stored in
[`package-members.json`](./package-members.json).

The official changelog is pinned at the 2.1.96 tag commit. Its single 2.1.96
entry describes the Bedrock 403 regression fixed for
`AWS_BEARER_TOKEN_BEDROCK` and `CLAUDE_CODE_SKIP_BEDROCK_AUTH`.

## Package-member diff

| Status | Members |
| --- | ---: |
| Unchanged | 18 |
| Changed | 2 |
| Added | 0 |
| Removed | 0 |
| Mode-only changed | 0 |

The two changes are exhaustive:

- `package/cli.js` grows by 148 bytes.
- `package/package.json` changes only the version from 2.1.94 to 2.1.96.

`sdk-tools.d.ts`, all audio-capture executables, both seccomp helpers, all
ripgrep executables, licenses, and the readme are byte-identical.

The exact target package-tree SHA-256 is:

```text
17d169a1338c92dd7dd42f8f64627ba14d206e27c36db5826995fc0c4aff9446
```

## Exact generated-code recovery

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is a deterministic
Zstandard dictionary patch:

| Input/output | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.94 baseline bundle | 13,308,322 | `11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564` |
| Delta | 319,590 | `0739b86c55b23697173396ef29737191f45ef0ad9c1479e4666484842f67d1c5` |
| Reconstructed 2.1.96 bundle | 13,308,470 | `62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e` |

The package reconstructor applies that delta, uniquely replaces the package
version, copies all 18 unchanged members with their target modes, and compares
all 20 outputs with the authenticated target.

## Exhaustive generated-code accounting

The source oracle contains 4,756 sources and 2,068,722 mapped segments. The
attribution inventory records 4,584 target initializer regions and 42,859
target partitions. Partitions plus exact anchors cover all 13,244,035 target
UTF-16 code units, leaving zero unaccounted.

The structural ledger classifies every target token:

| Classification | Tokens |
| --- | ---: |
| Matched | 4,190,103 |
| Moved candidate | 0 |
| Coarse changed candidate | 0 |
| Unresolved pairing | 76,570 |
| **Total** | **4,266,673** |

`unresolved` means the conservative matcher withheld a 2.1.94 pairing. Those
tokens remain present in the exact bundle, structural ledger, and readable
full-bundle diff.

## Readable full-bundle diff

[`readable-diff/normalized.diff.gz`](./readable-diff/normalized.diff.gz)
contains the complete Git-style comparison after conservative Program-scope
binding alignment. It records:

- 13,068 structurally unique statement pairs;
- 3,410 accepted binding alignments;
- 7,418 identifier edits; and
- 2,306 rejected unsafe alignments.

The target comparison-invariant hash is identical before alpha rename, after
rename, and after statement normalization. This is a checked comparison
representation, not executable or authored source.

## Source-facing recovery

After neutralizing only release/build metadata, the adjacent bundle evidence
contains exactly three semantic Bedrock-auth sites plus one new helper:

1. The main API client maps with high confidence to
   `src/services/api/client.ts`. The patch:
   - extracts an existing Authorization header case-insensitively;
   - gives `AWS_BEARER_TOKEN_BEDROCK` precedence;
   - reuses a custom Authorization header when skip-auth is enabled;
   - passes bearer credentials through the Bedrock SDK's `apiKey` option;
   - keeps one canonical Authorization header; and
   - uses `skipAuth` only when no API key is available.
2. A Bedrock setup-wizard bearer-client helper changes from
   `skipAuth + defaultHeaders.Authorization` to `apiKey`. Its generated module
   is target-only relative to the source oracle and current tree.
3. The exported Bedrock model-upgrade probe makes the same `apiKey` change.
   Its generated module is also target-only.

The latter two sites have exact target fragments and tests, but no exact
source path is claimed. Source-order evidence suggests a setup component and
a model-upgrade utility, but publishing those guesses as authored paths would
invent information erased by the build.

The ordered source patch is:

1. `recovered/bedrock-auth.patch`

The source lineage is independently pinned:

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Recovered 2.1.94 base | 1,931 | 30,686,905 | `f24db0beefa396a41d5a37101ef6089df6ab185d1813b7e75663854202a10892` |
| Applied 2.1.96 overlay | 1,931 | 30,687,527 | `2485f83f856b3b49188d0c1ca6125dec64959240ce149291306926cb1deed717` |

The lineage gate reverse-applies the patch to reproduce the exact 2.1.94
tree, reapplies it, byte-compares the result with the repository, Bun-builds
the changed TypeScript path, and runs three target-backed semantic tests.

## Verification

Acquire immutable evidence and run the aggregate gate:

```sh
CASE=recovery/cases/2.1.94-to-2.1.96
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.94/package.tgz"
```

Expected top-level status:

```text
complete-recovery-verified
```

The gate verifies evidence identity, source-oracle topology, all four target
fragments, bidirectional source lineage, syntax and semantic tests, exact
bundle reconstruction, complete attribution and structural accounting,
readable-diff invariants, and the exact 20-member package tree.

With the published 2.1.89, 2.1.90, 2.1.91, 2.1.92, 2.1.94, and 2.1.96
bundles supplied to their target-backed tests, the repository-wide recovery
suite passes all 105 tests with no skips.
