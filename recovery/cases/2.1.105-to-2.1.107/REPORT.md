# Claude Code 2.1.105 → 2.1.107 recovery report

## Result

Claude Code 2.1.107 is complete at the published-code layer.

- The authenticated 2.1.107 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.105 bundle and the exact Zstandard dictionary delta.
- The complete 20-member npm package tree reconstructs exactly. All
  49,295,019 unpacked member bytes, paths, types, modes, and link targets
  match the authenticated target.
- Eighteen members are byte-identical. The exhaustive changed set is
  `package/cli.js` and the version-only `package/package.json`;
  `package/sdk-tools.d.ts` is unchanged.
- All 13,612,212 target UTF-16 code units are covered by attribution, and all
  4,354,582 JavaScript tokens are classified.
- A reversible source-facing overlay advances three defensible owners from
  the verified 2.1.105 repository state.

The exact original TypeScript tree remains only partially observable because
neither adjacent published package contains a source map. The case is
therefore labeled `generated-complete-source-partial`.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, SHA-256 `6f6f6b97…13844` |
| Published package tree | Exact, 20 members and 49,295,019 bytes |
| Public declarations | Exact, byte-identical |
| Target generated offsets | 13,612,212 / 13,612,212 |
| Target JavaScript tokens | 4,354,582 / 4,354,582 classified |
| Incremental source overlay | Reversible patch on three paths |
| Original authored spelling | Partially unobservable |

## Published adjacency

The registry and official Git history independently establish one direct
published-release step:

```text
2.1.105  2026-04-13T19:51:19.552Z  550aeecc9780f6334c25d5df7ce1a24830278843
2.1.107  2026-04-14T05:18:14.905Z  194736a4bd11d8329974978abab33019aaad64f1
```

Upstream published neither npm version 2.1.106 nor Git tag `v2.1.106`. The
2.1.107 tag commit has the 2.1.105 tag commit as its sole parent. Its Git diff
adds the one-bullet 2.1.107 changelog section, “Show thinking hints sooner
during long operations.” Release notes are used as semantic locators only;
the signed published npm artifacts remain the executable oracle.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.105 npm tarball | 18,645,640 | `b42020694fdbdd216a1257e5aefe7bd893803c74454f872884fb09b675cafb88` |
| 2.1.105 `cli.js` | 13,676,915 | `8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75` |
| 2.1.107 npm tarball | 18,646,371 | `447f42addc14dadf679873899b9758f7f09ec723c3de9787d5493070561842e7` |
| 2.1.107 `cli.js` | 13,678,154 | `6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844` |
| Unchanged `sdk-tools.d.ts` | 117,636 | `434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 223,502 | `489c72da6cb1a1cab53223cc6a8e1e8336d11bffdcaf42a51c56163645e34680` |

Both npm tarballs pass registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature
verification under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Exact package and generated-code recovery

The exhaustive package report records 18 unchanged and two changed members,
with no additions, removals, or mode-only changes. The target framed
package-tree SHA-256 is:

```text
090976e2da071c4328e567c954cfaeea6dea96cc604e0809f3bdcdc45ac2fe64
```

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is 952,059 bytes with
SHA-256
`8fbad613638ebb1c4bddf024a19d99e2cae10df29a3159ad86f5fdf82af459ae`.
Replay produces the exact 13,678,154-byte target bundle.

The package metadata change is independently reproducible as the unique
version replacement 2.1.105 → 2.1.107. The public declarations are copied
unchanged from the authenticated baseline and byte-compared with the
authenticated target. The exact delta also preserves the target's
`external-build-2211` provenance stamp; that generated-only change is
deliberately not assigned an authored-source owner.

## Exhaustive accounting

The source-attribution inventory retains 4,756 exact baseline source-owner
rows, 4,664 target initializer regions, and 38,092 exhaustive target
partitions. Exact anchors plus partitions account for every target UTF-16
unit.

The structural ledger classifies every target token:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 19,040 | 4,277,321 |
| Moved candidate | 0 | 0 |
| Coarse changed candidate | 0 | 0 |
| Unresolved pairing | 83 | 77,261 |
| **Total** | **19,123** | **4,354,582** |

`unresolved` means the conservative matcher withheld a 2.1.105 pairing. Those
tokens are not missing: they remain in the exact target bundle, token ledger,
and complete readable diff.

The readable comparison records 13,474 structurally unique statement pairs,
8,102 accepted target-to-baseline bindings, 24,383 identifier edits, and
6,634 rejected unsafe alignments. The target comparison-invariant hash remains
`ba679d0cdb699263e1f3dad09b3e0d03f816d951c28e9e877043058bad82c58d`
through every normalization stage.

## Source-facing recovery

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is a reversible 3,700-byte patch with 45 insertions, six deletions, and
SHA-256
`da74bdf604858bb15a064cd583ca278469101c26f69b95d19690f45263b6d73e`.
It localizes the following target-backed behavior:

- the five long-thinking notices now appear after 10, 30, 50, 80, and 120
  seconds instead of 30, 60, 90, 150, and 240 seconds;
- an Opus 4.6 and client-data experiment gate controls an exact
  `thinking_guidance` system-prompt section; and
- eligible follow-up prompts receive the exact hidden thinking reminder only
  when thinking remains enabled, no custom system prompt is active, and the
  conversation already contains an assistant message.

The experiment-gated guidance is directly observable in the authenticated
target bundle but is not mentioned by the one-line changelog; it is not
inferred from release-note prose.

The exact strings, literals, predicates, and control flow are preserved from
the published bundle. Function names, types, imports, formatting, and exact
original module boundaries remain source-facing inference where the build
erased them. The build-provenance stamp remains complete at the bundle layer
without an unsupported source-facing placement.

## Source lineage and verification

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Verified 2.1.105 base | 1,933 | 30,718,359 | `85881766…c27a` |
| Applied 2.1.107 overlay | 1,933 | 30,720,127 | `a7daf57d…82b7` |

The complete gate reverse-applies the patch, checks the exact base tree,
reapplies it, byte-compares the result, Bun-builds all three changed paths,
runs five target-backed tests, reconstructs the exact bundle, and compares
every reconstructed package member.

```sh
CASE=recovery/cases/2.1.105-to-2.1.107
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.105/package.tgz"
```

Expected status: `complete-recovery-verified`.

## Semantic source audit

The fail-closed `compiled-ast-function-semantics-v1` ledger accounts for all 83
structurally nonmatched target units and reports zero first-party source
runtime gaps. The first-party target behavior is therefore semantically
reproduced by the historical source plus
[`semantic-supplement.patch`](./semantic-supplement.patch). No changed unit is
classified as dependency runtime, but the historical source tree still lacks
a pinned application dependency manifest, lockfile, and hermetic build recipe;
whole-bundle semantic equivalence from source is therefore not claimed.
