# Claude Code 2.1.92 → 2.1.94 recovery report

## Result

The recoverable Claude Code 2.1.94 release is complete at the published-code
layer. Upstream did not publish version 2.1.93, so 2.1.92 is the immediately
preceding published baseline for this recovery.

- The authenticated 2.1.94 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.92 bundle and the case's 2,021,935-byte exact delta.
- The complete 20-member npm package tree reconstructs exactly. All
  48,924,688 unpacked member bytes, paths, types, and modes match the
  authenticated target archive.
- Ten changed vendor executables reconstruct exactly from hash-pinned
  Zstandard dictionary patches against their 2.1.92 counterparts.
- Every one of the target bundle's 13,243,887 UTF-16 code units is covered by
  the attribution inventory.
- Every one of its 4,266,602 JavaScript tokens is classified as matched,
  moved, changed, or explicitly unresolved.
- The case includes a complete binding-aware bundle diff, compact statement
  diff, and rename ledger.
- The source-facing overlay is recorded as 9 ordered patches covering 44
  path transitions. All 44 source files pass Bun syntax builds, all 13
  focused target-backed tests pass, and the 102-test recovery suite passes.

The exact original 2.1.94 TypeScript tree is not uniquely recoverable.
Neither published package provides a source map, so types, comments,
formatting, many local names, and some module boundaries were erased. The
case is therefore labeled `generated-complete-source-partial`: the published
executable and package tree are exact, while source-facing TypeScript is
limited to behavior supported by target evidence.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, target SHA-256 `11fa0f14…9564` |
| Published package tree | Exact, 20 members and 48,924,688 bytes |
| Target generated offsets | Complete, 13,243,887 / 13,243,887 UTF-16 units |
| Target JavaScript tokens | Complete classification, 4,266,602 / 4,266,602 |
| Full readable bundle diff | Complete comparison view |
| Incremental repository source | Partial, 9 reversible patches across 44 paths |
| Original authored 2.1.94 spelling | Partially unobservable |

## Published-version adjacency

An exact registry lookup for `@anthropic-ai/claude-code@2.1.93` returns no
matching version. The recovery therefore advances one published release:

```text
2.1.92  immediately preceding published package
2.1.93  not published by upstream
2.1.94  target published package
```

The skipped number is not modeled as an unknown intermediate bundle. Every
exact delta, package-member comparison, structural pairing, and readable
comparison in this case is directly 2.1.92 → 2.1.94.

## Baseline roles

This case keeps two baselines separate:

1. **2.1.92 is the adjacent generated baseline.** Exact delta, package,
   structural, and readable comparisons are all 2.1.92 → 2.1.94.
2. **2.1.88 is the source-ownership oracle.** Its matching bundle and source
   map identify baseline module ownership for attribution.

The 2.1.88 map is never applied directly to 2.1.92 or 2.1.94 offsets. The
manifest names the roles independently as `baselineBundle`,
`sourceOracleBundle`, and `sourceOracleMap`.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.92 npm tarball | 17,164,906 | `fff885f916e6b3a71853559601af12abb1b64714cfc2f0635a25613b96749347` |
| 2.1.92 `cli.js` | 13,221,767 | `6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362` |
| 2.1.94 npm tarball | 18,527,047 | `14a2aa53b5227d165f629bcad120c13fc09728168445c95e95641d62c4b00382` |
| 2.1.94 `cli.js` | 13,308,322 | `11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 200,582 | `e91c85e981d6c60d7d8228e11b965a3e4aad88c1fb9d4e34ae05db9c096a4113` |

Both npm tarballs are authenticated against registry SHA-1, SHA-512 SRI, and
ECDSA signatures under registry key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`. The key's SPKI SHA-256 is
`fb190a462123443500cbcdb6519623e7179e9f38d84ad4e9362b72d2b68b62c1`.
The exhaustive comparison is stored in
[`package-members.json`](./package-members.json).

The official changelog is pinned at commit
`b9fbc7796b80659c570265deee97b0a8fc40bd89`; its 2.1.94 section has 25
entries. Release notes guide localization. Authenticated package bytes remain
the oracle.

## Package-member diff

Both the baseline and target have 20 members:

| Status | Members |
| --- | ---: |
| Unchanged | 8 |
| Changed | 12 |
| Added | 0 |
| Removed | 0 |

The twelve changes are exhaustive:

- `package/cli.js` grows by 86,555 bytes.
- `package/package.json` changes only the version from 2.1.92 to 2.1.94.
- Four audio-capture executables change content without changing size:
  arm64 and x64 Darwin, plus arm64 and x64 Windows.
- All six ripgrep executables change and grow: arm64 and x64 builds for
  Darwin, Linux, and Windows.

The two Linux audio-capture executables, both seccomp helpers, declarations,
license, readme, and ripgrep license are byte-identical.
`sdk-tools.d.ts` is 117,138 bytes with SHA-256
`d54800cb26dbfc3e15d0ab034ef9c77e340fb7ec76270a167f39245f7155c4b4`
in both releases.

The exact reconstructed framed package-tree SHA-256 is:

```text
bf795adc3f8d22228c0eb81c38f0049b1dfa9f71ef93a23f9a0e5ab1d7737c89
```

## Exact generated-code recovery

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is a deterministic
Zstandard dictionary patch:

| Input/output | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.92 baseline bundle | 13,221,767 | `6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362` |
| Delta | 2,021,935 | `654793f39daa8d8cdce358999a8f0ebc63811b1c4a233dcfba91c2958fe5ad73` |
| Reconstructed 2.1.94 bundle | 13,308,322 | `11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564` |

The ten changed vendor members use deterministic Zstandard dictionary
patches:

| Target package member | Target bytes | Patch bytes | Patch SHA-256 |
| --- | ---: | ---: | --- |
| `vendor/audio-capture/arm64-darwin/audio-capture.node` | 438,112 | 138 | `25f8cd5d19a06c176770dcecb1c2c02b1e9dcb0ec743c2cafb526408326c5506` |
| `vendor/audio-capture/arm64-win32/audio-capture.node` | 471,040 | 138 | `3b3077a3833345bc6cfea4e28967d9c9cff874eeb1dd66513f8aefc2edda7e09` |
| `vendor/audio-capture/x64-darwin/audio-capture.node` | 439,076 | 99 | `092e20f3e6a796daf6f1268f41d4d263a6b9cb69c6e8fdd39518b23e47236a3b` |
| `vendor/audio-capture/x64-win32/audio-capture.node` | 509,440 | 139 | `e2ad2f24077d7fb270af31450a99cf39b41f9d96da63ce668111b6f352d1d6ee` |
| `vendor/ripgrep/arm64-darwin/rg` | 4,522,704 | 884,996 | `9eed704bddd41d5de2fba8ed884d6e37fa2577292d8fd2659d68ca201eb56230` |
| `vendor/ripgrep/arm64-linux/rg` | 5,182,680 | 1,066,103 | `6015cb6a8f6171d1c9b75aa5b7e308022cb9fc78b84e8106a2013599f2af1267` |
| `vendor/ripgrep/arm64-win32/rg.exe` | 4,700,160 | 989,691 | `9e12fa66d8bc603753dc6a309f489f9c8156b1110937c7bf700dd10757fae254` |
| `vendor/ripgrep/x64-darwin/rg` | 5,080,600 | 965,440 | `ca4d46f155949be219168ed6306c33428d647d41ca326317907876f02fe585e9` |
| `vendor/ripgrep/x64-linux/rg` | 6,526,864 | 1,410,144 | `ebaca455e97479c6c33ad811a9e991401181147739aa32c636fd1713fea84b47` |
| `vendor/ripgrep/x64-win32/rg.exe` | 5,319,168 | 1,049,035 | `f536d44e053cb17e53fa5e6a70be3e7e00856e5fb73f47e92c693bb48a6f67cf` |

The package reconstructor requires one hash-pinned patch recipe for every
otherwise unsupported changed member. It rejects missing, duplicate, unused,
or unsafe recipes, verifies reconstructed bytes and modes, and compares every
member with the authenticated target archive.

## Exhaustive generated-code accounting

The source oracle contains 4,756 sources and 2,068,722 mapped segments. The
attribution inventory records 4,584 target initializer regions and 42,859
target partitions. Partitions plus exact anchors account for all 13,243,887
target UTF-16 code units, leaving zero unaccounted.

The structural ledger classifies every target token:

| Classification | Tokens |
| --- | ---: |
| Matched | 3,879,475 |
| Moved candidate | 14,854 |
| Coarse changed candidate | 59,881 |
| Unresolved pairing | 312,392 |
| **Total** | **4,266,602** |

`unresolved` means the conservative matcher withheld a 2.1.92 pairing. Those
tokens are not missing: they remain in the exact target bundle, structural
ledger, and readable full-bundle diff.

## Readable full-bundle diff

[`readable-diff/normalized.diff.gz`](./readable-diff/normalized.diff.gz)
contains the full Git-style comparison after conservative Program-scope
binding alignment. It records:

- 12,725 structurally unique statement pairs;
- 18,072 accepted binding alignments;
- 93,462 identifier edits; and
- 4,462 rejected unsafe or ambiguous alignments.

The target comparison-invariant hash is identical before alpha rename, after
rename, and after statement normalization. This is a checked comparison
representation, not executable or authored source.

## Source-facing recovery

The 2.1.94 overlay recovers the target-backed source behavior for:

- Mantle provider selection, SDK construction, model routing, environment
  propagation, status/capability handling, the higher Pro/API-key effort
  default, and the corrected Bedrock Sonnet 3.5 v2 inference profile;
- bounded `Retry-After` handling, macOS keychain failure reporting and doctor
  diagnostics, Slack send-tool presentation, stream-json UTF-8 decoding, SDK
  partial responses on abort, cross-worktree resume, and settings-aware
  `FORCE_HYPERLINK`;
- plugin output-style metadata, stable skill names, skill hooks and installed
  plugin-root handling, plus `UserPromptSubmit` session titles;
- Shift+Space normalization, multiline prompt layout, tmux outer-terminal
  detection, virtual-list key recomputation, alt-screen stale-row clearing,
  and selected-tab native cursor tracking; and
- SDK `get_settings` parse/validation errors with warning-only entries
  excluded.

The ordered patch files are:

1. `recovered/mantle-provider-and-models.patch`
2. `recovered/effort-and-retry.patch`
3. `recovered/plugin-and-prompt-hooks.patch`
4. `recovered/keychain-diagnostics.patch`
5. `recovered/slack-send-header.patch`
6. `recovered/stream-json-utf8.patch`
7. `recovered/resume-sdk-and-hyperlinks.patch`
8. `recovered/terminal-and-transcript-rendering.patch`
9. `recovered/sdk-settings-validation.patch`

Together they modify 43 existing paths and add
`src/services/mcp/slackToolRendering.tsx`; there are no deletions or renames.
The two VS Code-specific changelog entries are deliberately not modeled in
the CLI tree: adjacent authenticated package evidence shows no extension
code or corresponding CLI behavior change.

Seven changed files retain inherited inline source-map payloads. Those
payloads were compared byte-for-byte with the 2.1.92 base and left unchanged:
2.1.94 publishes no replacement map, so regenerating them would invent
provenance rather than recover target evidence.

The source patches must remain reversible, ordered, and hash-pinned in
[`manifest.json`](./manifest.json). Each target fragment must have exactly one
recovery explanation, and every recovered file must be asserted by byte
length and SHA-256.

The source lineage must be independently pinned:

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Recovered 2.1.92 base | 1,930 | 30,672,193 | `18f5471774fe00053622904e4fa157592d1c887b6b7bed32fe9528b62ca0e42e` |
| Applied 2.1.94 overlay | 1,931 | 30,686,905 | `f24db0beefa396a41d5a37101ef6089df6ab185d1813b7e75663854202a10892` |

The lineage gate reverse-applies all nine patches to reproduce the exact
2.1.92 tree, reapplies them in manifest order, and byte-compares the result
with the repository. It also Bun-builds all 44 changed/added TypeScript paths
and runs 13 target-backed semantic tests; every check passes.

## Verification

Acquire immutable evidence and run the aggregate gate:

```sh
CASE=recovery/cases/2.1.92-to-2.1.94
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.92/package.tgz"
```

Expected top-level status:

```text
complete-recovery-verified
```

The gate verifies evidence identity, source-oracle topology, target fragments,
bidirectional source lineage, syntax and semantic tests, exact bundle
reconstruction, complete attribution and structural accounting,
readable-diff invariants, all ten changed-member dictionary patches, and the
exact 20-member package tree.
