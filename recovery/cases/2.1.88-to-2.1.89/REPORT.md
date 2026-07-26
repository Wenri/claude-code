# Claude Code 2.1.88 → 2.1.89 recovery report

## Result

The recoverable 2.1.89 release is complete.

- The published 2.1.89 `cli.js` is reconstructed byte-for-byte from the
  pinned 2.1.88 bundle and a deterministic 2,249,231-byte delta.
- The complete 19-member 2.1.89 npm package tree is reconstructed and every
  member is compared with the authenticated target archive.
- Every one of the target bundle's 13,017,066 UTF-16 code units is covered by
  the generated-offset attribution inventory.
- Every one of its 4,197,802 JavaScript tokens is present in the structural
  ledger as `matched`, `moved`, `changed`, or explicitly `unresolved`.
- A binding-aware, full-bundle Git diff is included, together with a compact
  structural statement diff and the accepted rename ledger.
- Exact public declaration/package edits and one readable Bash/parser feature
  slice are recovered as source-facing patches and checked against generated
  2.1.89 helpers.

The exact original TypeScript tree is not recoverable from this package.
2.1.89 contains a minified JavaScript bundle and no source map. Types,
comments, formatting, many module boundaries, and most local names were
erased before publication; more than one authored source tree can produce the
same bundle. The manifest therefore labels this result
`generated-complete-source-partial`: the published executable and package
member tree are exact, while readable authored-source spelling remains
partial, inferred, or unobservable.

| Layer | Result | Meaning |
| --- | --- | --- |
| Published package members | Exact | 16 unchanged, three changed, one removed, zero added |
| Published `cli.js` | Exact | Delta reconstruction equals target SHA-256 `a9950e…` |
| Target generated offsets | Complete | 13,017,066 / 13,017,066 UTF-16 units accounted |
| Target JavaScript tokens | Complete classification | 4,197,802 / 4,197,802 tokens classified |
| Baseline source ownership | Exact | All 4,756 mapped inputs have one contiguous generated run |
| Full readable bundle diff | Complete comparison view | Entire target is represented; unsafe renames remain rejected |
| Source-like TypeScript recovery | Partial | Exact/equivalent patches for the declaration and Bash/parser slice |
| Original 2.1.89 TypeScript spelling | Unobservable | The target artifact does not retain it |

## Immutable evidence

[`manifest.json`](./manifest.json) is the case contract. Acquisition and
verification reject any byte count or SHA-256 mismatch.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.88 `cli.js` | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 `cli.js.map` | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| 2.1.88 `sdk-tools.d.ts` | 116,949 | `53d249727389f9c9af5192f99bf66c4513b89d710e4326082ce1d218c3e6c7fc` |
| 2.1.88 `package.json` | 1,242 | `e21f9e98fa4ea8b4d007063d92c631df1bbed6d11c9e79c5fcdeb9f4859dc8fa` |
| Original 2.1.88 npm tarball | 31,196,633 | `d836a86d9150ecc594a7025524c50e24080478904c979f386d447770275ef813` |
| 2.1.89 npm tarball | 16,493,038 | `680e35001b24b604f58958e3a324bb758be3c069c0a3f89585156256f17a9c87` |
| 2.1.89 `cli.js` | 13,081,065 | `a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01` |
| 2.1.89 `sdk-tools.d.ts` | 117,129 | `05ecc6a51d013f5e9b8f1cc86818c467435a71187d18005d3125ed6e0c52fe2d` |
| 2.1.89 `package.json` | 1,242 | `2cc59f27f893cbfc4dce4d8da7ea4a088d3721afeeed5e3e3438a0fcef92d109` |

The original 2.1.88 tarball is no longer available at its npm registry URL.
The package-member report authenticates the recovered copy against archived
npm SHA-1, SHA-512 SRI, and ECDSA registry-signature metadata. Its manifest
entry records an
[immutable metadata snapshot](https://gist.githubusercontent.com/auscompgeek/f21d70668acb682f5f362d129183afe9/raw/50277188f5f7a234a2348ee0a0210bd5876247d5/claude-code-2.1.88-sig.json)
and a best-effort archival download. Core bundle/map verification does not
depend on that download; exact whole-package reconstruction accepts a local
copy only after checking the pinned 31,196,633-byte length and SHA-256.

The official changelog is also pinned at Git commit
`7ef6eec9d9ba84ea6f233f26c45f1df5c5991843`. Its 2.1.89 section has 52
bullets. It is corroborating release evidence; artifact bytes remain the
oracle.

## Package-member diff

[`package-members.json`](./package-members.json) is an exhaustive comparison
of member path, type, mode, link target, and uncompressed bytes:

| Status | Members |
| --- | ---: |
| Unchanged | 16 |
| Changed | 3 |
| Added | 0 |
| Removed | 1 |
| Union | 20 |

The three changed files are `cli.js`, `package.json`, and `sdk-tools.d.ts`.
The sole removal is `cli.js.map`. `README.md`, `LICENSE.md`, `bun.lock`, all
six audio-capture binaries, all six ripgrep binaries, and the ripgrep license
are byte-identical. All modes of common members are identical.

`package.json` changes only `"version": "2.1.88"` to `"2.1.89"`.
`sdk-tools.d.ts` has exactly one insertion:

```ts
/**
 * Model-facing note listing readFileState entries whose mtime bumped during this command (set when WRITE_COMMAND_MARKERS matches)
 */
staleReadFileStateHint?: string;
```

`reconstruct-package.mjs` copies unchanged baseline members, omits the map,
applies those two exact text transforms, reconstructs `cli.js` from the
binary delta, preserves target modes, and compares all 43,022,346 output
bytes with the published target archive. The result is 19 members with framed
tree SHA-256
`cf6051611c5e7fca17e3bf8b9d7aa22d9da729388462fb3972a896ea29cea3b1`.

## Exact generated-code recovery

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is a deterministic
Zstandard dictionary patch:

| Input/output | Bytes | SHA-256 |
| --- | ---: | --- |
| Baseline bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| Delta | 2,249,231 | `33be2f1480544cbe09873fe610d5a01c66bf9bb025594637c93f3c915158db6d` |
| Reconstructed target | 13,081,065 | `a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01` |

The builder reconstructs to a temporary file and compares every byte before
reporting `exact-delta-verified`. Repeated construction with Zstandard 1.5.7
produces the same delta bytes.

## Exhaustive generated-offset attribution

[`attribution/summary.json`](./attribution/summary.json) and its three
JSONL-gzip ledgers use the verified 2.1.88 source map as the ownership oracle:

- all 2,068,722 mapped segments decode;
- all 4,756 baseline sources form exactly one contiguous generated run;
- those sources comprise 1,902 application files, 2,850 dependency files,
  and four vendor files;
- 44,221 exact common literal anchors are unique on both sides;
- 43,590 anchors are monotone and define 43,591 target partitions;
- 4,527 baseline and 4,537 target Bun wrapper regions are inventoried; and
- partitions plus exact anchor spans cover all 13,017,066 target UTF-16 code
  units, leaving zero unaccounted.

| Partition evidence | Partitions | Target UTF-16 |
| --- | ---: | ---: |
| Exact generated | 23,228 | 614,674 |
| Changed, high-confidence source | 17,764 | 5,115,956 |
| Changed, source candidates | 2,593 | 4,565,415 |
| Unresolved source candidate | 6 | 1,896 |
| Exact anchor spans | 43,590 | 2,719,125 |

This is exhaustive generated-offset accounting, not a claim that target
source identities are exact. Only the baseline has a source map; target
source attribution is evidence-ranked.

## Structural token diff

[`structural/generated-delta.json.gz`](./structural/generated-delta.json.gz)
partitions both bundles into parseable top-level statements and produces a
complete Acorn-token ledger:

| Classification | Target units | Target tokens |
| --- | ---: | ---: |
| Matched | 14,898 | 3,619,974 |
| Moved candidate | 1,347 | 46,432 |
| Coarse changed candidate | 480 | 124,936 |
| Unresolved pairing | 1,456 | 406,460 |
| **Total** | **18,181** | **4,197,802** |

Exact structural matches (`matched` plus `moved`) cover 87.341089% of target
tokens. Including coarse changed pairs, bounded baseline correspondence
reaches 90.317314%. `unresolved` means the matcher refused to invent a
baseline pairing; those tokens are still fully present in the exact target
recovery and ledger.

Controls include 100% self-comparison, scope-correct local/global alpha
renaming, mutation tests for operand and argument swaps, runtime property
keys, shorthand values, statement moves, target-only additions, canonical
gzip validation, and path-independent regeneration.

## Readable full-bundle diff

[`readable-diff/normalized.diff.gz`](./readable-diff/normalized.diff.gz)
is the requested full Git-style bundle diff. Inspect it with:

```sh
gzip -cd \
  recovery/cases/2.1.88-to-2.1.89/readable-diff/normalized.diff.gz |
  less
```

The generator puts top-level statements on separate lines and derives safe
target-to-baseline Program-scope renames from unique structural pairs:

| Measurement | Value |
| --- | ---: |
| Baseline statements | 18,127 |
| Target statements | 18,181 |
| Unique structural pairs | 12,334 |
| Accepted Program bindings | 16,254 |
| Identifier edits | 87,233 |
| Rejected unsafe/ambiguous bindings | 5,580 |
| Full uncompressed diff bytes | 24,096,865 |

[`readable-diff/statements.diff`](./readable-diff/statements.diff) is the
compact type/structural-hash diff, and
[`readable-diff/renames.tsv`](./readable-diff/renames.tsv) records every
accepted name alignment.

The target comparison-invariant hash is the same before alpha renaming,
after renaming, and after statement normalization:
`23a1c0965a30ffa3bb4d1e813545a00caf505b68d955bce152992c92d8d59aa4`.
This is deliberately called a comparison invariant, not proof of runtime
equivalence: JavaScript can observe binding spelling through direct `eval`,
`Function.name`, and source-text inspection. The published bundle remains
the executable oracle.

## Readable source-facing recovery

The exact generated recovery is complemented by a smaller source-like patch:

- [`recovered/sdk-tools.pristine.patch`](./recovered/sdk-tools.pristine.patch)
  records the exact declaration insertion and package version change.
- [`recovered/bash-parser.pristine.patch`](./recovered/bash-parser.pristine.patch)
  reconstructs parser-backed Bash command splitting/help behavior.
- [`recovered/src/tools/BashTool/fileReadState.ts`](./recovered/src/tools/BashTool/fileReadState.ts)
  reconstructs Bash `cat`/`sed` read-state tracking with inferred names/types.
- [`recovered/BashTool.pristine.patch`](./recovered/BashTool.pristine.patch)
  applies the helper to the human-facing nested TSX layer.
- [`recovered/BashTool.bun-input.patch`](./recovered/BashTool.bun-input.patch)
  records the equivalent compiler/Bun-input integration.
- [`recovered/bash-read-state-model.mjs`](./recovered/bash-read-state-model.mjs)
  is the differential-test oracle.

Nine exact generated fragments pin this slice. Target-backed tests compare
parse-tree selection, argument extraction, split/help behavior, accepted and
rejected read commands, cache writes, formatter markers, stale-file
detection, and exact hint text. Both source layers apply cleanly and all eight
changed TypeScript inputs syntax-build through Bun with external imports.

This patch is useful readable code, but it is not presented as the complete
authored 2.1.89 source tree.

## Reusable recovery and verification

Install the pinned tooling and acquire all currently available artifacts:

```sh
pixi run npm --prefix recovery ci --ignore-scripts

RECOVERY_ARTIFACTS=$(mktemp -d)
pixi run node recovery/scripts/acquire-case.mjs \
  --case recovery/cases/2.1.88-to-2.1.89/manifest.json \
  --output "$RECOVERY_ARTIFACTS"
```

Given a local original 2.1.88 npm tarball matching SHA-256 `d836a86d…`, the
single complete gate is:

```sh
pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case recovery/cases/2.1.88-to-2.1.89/manifest.json \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball /path/to/claude-code-2.1.88.tgz
```

Expected status:

```json
{
  "status": "complete-recovery-verified",
  "checks": {
    "evidence": "evidence-verified",
    "sourcePatches": "patches-verified",
    "exactBundleDelta": "exact-delta-verified",
    "attribution": "attribution-report-verified",
    "structural": "structural-ledger-verified",
    "readableDiff": "readable-diff-verified",
    "packageTree": "exact-package-tree-reconstructed"
  }
}
```

The verified run reports:

- 19 reconstructed package members and 43,022,346 member bytes;
- exact target bundle SHA-256 `a9950e…`;
- zero unaccounted target UTF-16 units;
- 4,197,802 / 4,197,802 classified target tokens; and
- 30 / 30 tests passing with the target artifact supplied.

To reconstruct and keep the exact package tree:

```sh
pixi run node recovery/scripts/reconstruct-package.mjs \
  --case recovery/cases/2.1.88-to-2.1.89/manifest.json \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball /path/to/claude-code-2.1.88.tgz \
  --output /tmp/claude-code-2.1.89-package
```

Each stage also has an independent CLI and verifier:

- `build-exact-delta.mjs`;
- `inventory-generated-change.mjs` and
  `verify-attribution-report.mjs`;
- `account-generated-delta.mjs` and
  `verify-structural-ledger.mjs`;
- `generate-readable-bundle-diff.mjs` and
  `verify-readable-diff.mjs`; and
- `compare-npm-tarballs.mjs`.

## Confidence boundary

| Claim | Confidence |
| --- | --- |
| Published 2.1.89 package member bytes and modes | Exact |
| Published 2.1.89 bundle reconstruction | Exact |
| Baseline source ownership | Exact |
| Target offset/token accounting | Exact and exhaustive |
| Structural target-to-baseline pairings | Exact, candidate, or unresolved as labeled |
| Full normalized bundle comparison | Verified comparison representation |
| Recovered Bash/parser behavior | Equivalent within target-backed tests |
| Recovered TypeScript names, types, and file placement | Inferred |
| Original erased comments, formatting, types, and module boundaries | Unobservable |

There is no missing published target code. Further work can expand the
human-facing TypeScript reconstruction feature by feature, but it cannot turn
erased information into an exact-source claim.
