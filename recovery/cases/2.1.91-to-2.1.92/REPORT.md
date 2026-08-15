# Claude Code 2.1.91 → 2.1.92 recovery report

## Result

The recoverable Claude Code 2.1.92 release is complete at the published-code
layer, and the evidence-backed source overlay is applied to this repository.

- The authenticated 2.1.92 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.91 bundle and the case's 2,285,915-byte exact delta.
- The complete 20-member npm package tree reconstructs exactly. All
  44,517,413 unpacked member bytes, paths, types, and modes match the
  authenticated target archive.
- The two target-only Linux `apply-seccomp` binaries reconstruct exactly from
  hash-pinned Zstandard payloads.
- Every one of the target bundle's 13,157,503 UTF-16 code units is covered by
  the attribution inventory.
- Every one of its 4,247,953 JavaScript tokens is classified as matched,
  moved, changed, or explicitly unresolved.
- The case includes a complete binding-aware bundle diff, compact statement
  diff, rename ledger, and 15 independently hashed target fragments.
- Seven reversible patches recover target-backed behavior across 17 source
  path transitions. The final 16 changed TypeScript/TSX files syntax-build,
  and 10 target-backed semantic tests pass.
- The repository-wide recovery suite passes all 83 tests when supplied with
  its authenticated historical bundles.

The exact original 2.1.92 TypeScript tree is not uniquely recoverable.
Neither adjacent npm package publishes a source map, so types, comments,
formatting, many local names, and some module boundaries were erased. The
case is therefore labeled `generated-complete-source-partial`: the published
executable and package tree are exact, while source-facing TypeScript is
limited to behavior supported by target evidence.

The semantic source audit is complete under
`compiled-ast-function-semantics-v1`. Its fail-closed ledger covers all 3,132
changed, moved, and unresolved target structural units and reports zero
first-party `source-runtime-gap` rows. The semantic supplement restores the
full Bedrock wizard and the shipped hidden `/setup-bedrock` command, while the
historical target tree and current `src/` retain equivalent owners for every
other reachable first-party behavior. This does not reconstruct erased
TypeScript spelling, comments, or declaration order.

The final canonical semantic supplement contains 147 `src/` paths and
5,567,219 bytes, pinned by SHA-256
`43b7f3165ca0502796e26a50e821c12a47b8bc95dc78a5744361091e0adf9062`.

Whole-bundle compilation from `src/` is still not reproducible. The ledger
retains 185 `dependency-runtime` gaps, and the target does not pin the root
application manifest/lockfile, dependency sources, or a hermetic build
recipe. Separately, the exact generated delta reconstructs the authenticated
`cli.js` byte-for-byte.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, target SHA-256 `6b0b8602…5362` |
| Published package tree | Exact, 20 members and 44,517,413 bytes |
| Target generated offsets | Complete, 13,157,503 / 13,157,503 UTF-16 units |
| Target JavaScript tokens | Complete classification, 4,247,953 / 4,247,953 |
| Full readable bundle diff | Complete comparison view |
| First-party runtime semantics from source | Complete, 3,132 / 3,132 nonmatched units classified; 0 source gaps |
| Whole-bundle dependency/build inputs | Incomplete, 185 dependency runtime gaps plus missing hermetic inputs |
| Original authored 2.1.92 spelling | Partially unobservable |

## Baseline roles

This case keeps two baselines separate:

1. **2.1.91 is the adjacent generated baseline.** Exact delta, package,
   structural, and readable comparisons are all 2.1.91 → 2.1.92.
2. **2.1.88 is the source-ownership oracle.** Its matching bundle and source
   map identify baseline module ownership for attribution.

The 2.1.88 map is never applied directly to 2.1.91 or 2.1.92 offsets. The
manifest names the roles independently as `baselineBundle`,
`sourceOracleBundle`, and `sourceOracleMap`.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.91 npm tarball | 16,522,495 | `4fb4dae771d6fad1e74703741148f5ee2d24837f4a04eab27041746f7a5b3e2b` |
| 2.1.91 `cli.js` | 13,162,543 | `b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816` |
| 2.1.92 npm tarball | 17,164,906 | `fff885f916e6b3a71853559601af12abb1b64714cfc2f0635a25613b96749347` |
| 2.1.92 `cli.js` | 13,221,767 | `6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 197,588 | `7fda3c1135f646cf678ce4676c444bc254025fd34e9ccd82ce29dabee8e6adf7` |

Both npm tarballs are authenticated against registry SHA-1, SHA-512 SRI, and
ECDSA signatures under registry key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`. The key's SPKI SHA-256 is
`fb190a462123443500cbcdb6519623e7179e9f38d84ad4e9362b72d2b68b62c1`.
The exhaustive comparison is stored in
[`package-members.json`](./package-members.json).

The official changelog is pinned at commit
`b543a256248ce5ff98804b8dfef4cd6247423d98`; its 2.1.92 section has 21
entries. Release notes guide localization. Authenticated package bytes remain
the oracle.

## Package-member diff

The baseline has 18 members and the target has 20:

| Status | Members |
| --- | ---: |
| Unchanged | 16 |
| Changed | 2 |
| Added | 2 |
| Removed | 0 |

The four differences are exhaustive:

- `package/cli.js` grows by 59,224 bytes.
- `package/package.json` changes the version and adds
  `vendor/seccomp/` to the `files` list.
- `package/vendor/seccomp/arm64/apply-seccomp` is added: 603,200 bytes,
  mode `0644`, SHA-256
  `e547755917a7343619e80a00a192842e125ee00454a3ee1e11af4fae0504315e`.
- `package/vendor/seccomp/x64/apply-seccomp` is added: 751,624 bytes,
  mode `0644`, SHA-256
  `b46118d36051d364b8857fd182251b209f8b339cb5772a0f81e814aba3c23a10`.

`sdk-tools.d.ts` is byte-identical between the releases.

The exact reconstructed framed package-tree SHA-256 is:

```text
e8abc7a21bab293650f17f5d3abd85b026132e6f53831c4c34499bd839ebe777
```

## Exact generated-code recovery

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is a deterministic
Zstandard dictionary patch:

| Input/output | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.91 baseline bundle | 13,162,543 | `b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816` |
| Delta | 2,285,915 | `125d66c66450debe0d6220fb5e351946095224e78de75d61b214908a89fa124a` |
| Reconstructed 2.1.92 bundle | 13,221,767 | `6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362` |

The two target-only package members use deterministic Zstandard payloads:

| Payload | Bytes | SHA-256 |
| --- | ---: | --- |
| arm64 `apply-seccomp.zst` | 240,857 | `3e3c4e804c4b88303f80a635eff83f5138812274aa34c2fbe1fd695e2851fbe6` |
| x64 `apply-seccomp.zst` | 294,356 | `5a973d6bfedaf645979b2ebd8886799ef7f682fb277d96ed88f2e72deea3485a` |

The package reconstructor rejects missing, duplicate, unused, or unsafe
payload recipes, decompresses each payload, verifies its target bytes and
mode, and compares every reconstructed member with the authenticated target
archive.

## Exhaustive generated-code accounting

The source oracle contains 4,756 sources and 2,068,722 mapped segments. The
attribution inventory records 4,579 target initializer regions and 43,047
target partitions. Partitions plus exact anchors account for all 13,157,503
target UTF-16 code units, leaving zero unaccounted.

The structural ledger classifies every target token:

| Classification | Tokens |
| --- | ---: |
| Matched | 3,667,147 |
| Moved candidate | 12,395 |
| Coarse changed candidate | 118,809 |
| Unresolved pairing | 449,602 |
| **Total** | **4,247,953** |

`unresolved` means the conservative matcher withheld a 2.1.91 pairing. Those
tokens are not missing: they remain in the exact target bundle, structural
ledger, and readable full-bundle diff.

## Readable full-bundle diff

[`readable-diff/normalized.diff.gz`](./readable-diff/normalized.diff.gz)
contains the full Git-style comparison after conservative Program-scope
binding alignment. It records:

- 12,460 structurally unique statement pairs;
- 17,871 accepted binding alignments;
- 88,189 identifier edits; and
- 4,443 rejected unsafe or ambiguous alignments.

The target comparison-invariant hash is identical before alpha rename, after
rename, and after statement normalization. This is a checked comparison
representation, not executable or authored source.

## Source-facing recovery

The incremental 2.1.92 source overlay recovers:

- the `forceRemoteSettingsRefresh` managed policy, fresh-fetch status,
  cache-preserving refresh, and fail-closed startup/onboarding gates;
- hostname-derived Remote Control session prefixes, the explicit
  `--remote-control-session-name-prefix` override, and prefix propagation;
- the target Stop/SubagentStop prompt-hook response and continuation policy;
- array/object coercion when streamed tool input contains JSON-encoded
  strings;
- Homebrew cask detection and preservation of stable versus latest channels;
- stable tmux `#{window_id}` targeting and cached window identity;
- correct Ctrl+E behavior at wrapped-line boundaries;
- an interactive `/release-notes` version picker; and
- removal of `/tag` and `/vim` from the built-in command registry.

The seven patch files are listed, ordered, and hash-pinned in
[`manifest.json`](./manifest.json). The release-notes transition explicitly
deletes `release-notes.ts` and adds `release-notes.tsx`; the verifier supports
and tests source-map-owned file deletion.

One inherited, non-material limit remains: the published bundles contain an
override seam that compiles to an always-undefined function. The recovered
source preserves the published runtime behavior but does not invent an
authored spelling for that dead seam.

The lineage is independently pinned:

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Recovered 2.1.91 base | 1,930 | 30,661,962 | `5a74a719338766ab26023fc4041013bce9ff968356d152cb7df725bdab8a4108` |
| Applied 2.1.92 overlay | 1,930 | 30,672,193 | `18f5471774fe00053622904e4fa157592d1c887b6b7bed32fe9528b62ca0e42e` |

`verify-source-lineage.mjs` reverse-applies all seven patches, proves the base
tree, reapplies them, and byte-compares the result with the repository. It
also syntax-builds the 16 final changed TypeScript/TSX files and runs 10
focused semantic tests against the adjacent authenticated bundles.

## Verification

Acquire immutable evidence and run the aggregate gate:

```sh
CASE=recovery/cases/2.1.91-to-2.1.92
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.91/package.tgz"
```

Expected top-level status:

```text
complete-recovery-verified
```

The gate verifies evidence identity, source-oracle topology, all 15 target
fragments, bidirectional source lineage, syntax and semantic tests, exact
bundle reconstruction, complete attribution and structural accounting,
readable-diff invariants, both target-only payloads, and the exact
20-member package tree.
