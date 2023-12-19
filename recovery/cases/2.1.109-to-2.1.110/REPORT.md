# Claude Code 2.1.109 → 2.1.110 recovery report

## Result

Claude Code 2.1.110 is complete at the published-package and generated-code
layers.

- The authenticated 2.1.110 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.109 bundle and the exact Zstandard dictionary delta.
- The complete 20-member npm package tree reconstructs exactly. All
  49,226,979 unpacked member bytes, paths, types, modes, and link targets
  match the authenticated target.
- Seventeen members are byte-identical. The exhaustive changed set is
  `package/cli.js`, the version-only `package/package.json`, and
  `package/sdk-tools.d.ts`.
- The declaration change is one exact insertion of
  `userModified?: boolean` in `FileWriteOutput`.
- All 13,543,815 target UTF-16 code units are covered by attribution, and all
  4,325,806 target JavaScript tokens are classified.
- A reversible source-facing overlay localizes the defensible 2.1.110
  behaviors across 88 source paths, including 14 new paths.

Neither adjacent package contains a source map. Exact erased TypeScript
names, types, comments, formatting, and module boundaries remain partially
unobservable, so the case is labeled
`generated-complete-source-partial`.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, SHA-256 `cc686e83…a861` |
| Published package tree | Exact, 20 members and 49,226,979 bytes |
| Public declarations | Exact, one 132-byte insertion |
| Target generated offsets | 13,543,815 / 13,543,815 |
| Target JavaScript tokens | 4,325,806 / 4,325,806 classified |
| Incremental source overlay | Reversible patch on 88 paths |
| Original authored spelling | Partially unobservable |

## Adjacent-release evidence

The executable comparison uses authenticated adjacent npm artifacts for
2.1.109 and 2.1.110. Registry and Git evidence independently establish this
one-step transition:

| Release | npm publication time | Tag commit |
| --- | --- | --- |
| 2.1.109 | `2026-04-15T03:45:21.462Z` | `f348a16da8280fced433f24ede16de612dd55ffd` |
| 2.1.110 | `2026-04-15T20:40:53.190Z` | `45ae2f52129b46290af61d0624a8e87eb973f57d` |

The 2.1.110 tag commit has the 2.1.109 tag commit as its sole parent. Its tree
is `042f779aef34869ca9dfea0d28151de10fa4726d`. The pinned official changelog
section contains 32 bullets and is 3,714 bytes, SHA-256
`408a20f1f236c0b002bcb70334bec07b5e302684bd64c71780fbd34a92c94545`.

The release covers five broad clusters:

- terminal behavior: `/tui`, `/focus`, fullscreen auto-scroll, synchronized
  output, relaunch input ownership, wide non-TTY lines, and external-editor
  context and command-injection hardening;
- plugins and commands: the Installed tab, favorites, dependency installation,
  scrolling skills, and Remote Control-safe slash commands;
- session and headless operation: scheduled-task resurrection, trace-context
  environment input, recap behavior, titles, cleanup, queued input, and Remote
  Control authentication and rename persistence;
- MCP and API reliability: duplicate-scope warnings, dropped-transport and
  non-JSON-stdout tolerance, bounded non-streaming fallback, and Bash timeout
  enforcement; and
- permissions and tool fidelity: user-modified writes, rechecking hook-rewritten
  input, bypass-mode policy, preserved failed-hook context, and explicit skill
  invocation within the current human turn.

The public Git history establishes adjacency and release intent but does not
expose the authored implementation. The signed npm artifacts remain the
executable authority.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.109 npm tarball | 18,621,822 | `0449b9d05b2141ba51c7a5262a7c62e68c73098b87e4fc97b5e1a517aaaf7128` |
| 2.1.109 `cli.js` | 13,543,570 | `3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7` |
| 2.1.110 npm tarball | 18,646,978 | `a9e68dbae2b27893bee13b019cff6417ac9db5947cbc209da1da86b895f76a58` |
| 2.1.110 `cli.js` | 13,609,982 | `cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861` |
| 2.1.110 declarations | 117,768 | `98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 230,226 | `969c6214457767a395f78a1a02cb0b7b357e28df3dc3812ead5cc065d483cdb9` |

Both npm tarballs pass registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature
verification under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Exact package and generated-code recovery

The exhaustive package report records 17 unchanged and three changed
members, with no additions, removals, or mode-only changes. The target
framed-tree SHA-256 is:

```text
23e2c220198c2c0ad0e58670acd27a652e41afe5ff5f76f49999112f6cf7a77e
```

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is 2,117,328 bytes with
SHA-256
`2aa2cd3fea6c56d795996c15134af802f27439074dc2dc368a209735479b8965`.
Replay produces the exact 13,609,982-byte target bundle. The metadata change
is the unique version replacement 2.1.109 → 2.1.110. The declaration is
reconstructed by inserting the four-line `userModified` documentation and
field after a unique `FileWriteOutput.gitDiff` anchor. The delta preserves
the target's `external-build-2205` provenance stamp.

## Exhaustive generated-code accounting

The attribution inventory retains 4,756 exact 2.1.88 source-owner rows,
4,677 target initializer regions, and 34,460 exhaustive target partitions.
Exact anchors plus partitions account for every target UTF-16 unit.

The structural ledger classifies every target token:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 12,734 | 3,090,117 |
| Moved candidate | 4,933 | 587,967 |
| Coarse changed candidate | 612 | 240,424 |
| Unresolved pairing | 1,179 | 407,298 |
| **Total** | **19,458** | **4,325,806** |

`unresolved` means the conservative matcher withheld a 2.1.109 pairing.
Those tokens remain present in the exact target bundle, token ledger, and
complete readable diff. The exact structural fraction is approximately
85.03%, and the resolved structural fraction is approximately 90.58%.

The readable comparison covers 19,277 baseline and 19,458 target statements,
with 13,259 structurally unique pairs, 18,022 accepted bindings, 94,042
identifier edits, and 5,104 rejected unsafe alignments. The comparison
invariant remains
`80c99e9137802c4f8475b60d2150794c68ff29aaa9c388697d742565aa447210`
through every accepted normalization.

## Source-facing recovery

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is a reversible 2,472,185-byte patch with 3,972 insertions, 642 deletions,
and SHA-256
`41675ceb46527d281529cac7e3c2cb9106f68fb60e03afbcc5f204a6fe568a67`.
It modifies or adds 88 paths. The main recovered clusters are:

- `/tui`, `/focus`, `/update`, external-editor context, fullscreen rendering,
  terminal capability detection, auto-scroll, relaunch, and focus transcript
  filtering;
- plugin favorites/disabled/attention UI, dependency closure and constraints,
  dependency package installation, update policy, rollback, and result notes;
- MCP scope conflict diagnostics, transport-loss deadlines, tolerant stdio,
  and Remote Control authentication, bridge-safe commands, and title writes;
- scheduled-task resume, session metadata durability, session cleanup, title
  suppression, trace-context input, session recap, and queued-message handling;
- write-result fidelity, hook context preservation, rewritten-input permission
  checks, bypass-mode safeguards, and turn-bounded explicit skill invocation;
  and
- bounded Bash/API waits, `/autocompact` settings and experiment behavior,
  source-safe editor execution, wide-line protection, overlay invalidation, and
  synchronized-output terminal detection.

One public behavior has no defensible authored placement in the cumulative
mirror: the provider setup-wizard relaunch scaffold predates this increment in
the generated bundle but is absent from the reconstructed source tree. Its
new call to sever inherited TTY input is exact in the recovered 2.1.110 bundle
and full diff, but is not fabricated into `ConsoleOAuthFlow.tsx`. This is the
principal concrete source-layer limitation in addition to the general loss of
authored spelling and module boundaries.

## Source lineage and verification

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Verified 2.1.109 base | 1,934 | 30,749,350 | `8ae464c7…c67` |
| Applied 2.1.110 overlay | 1,948 | 30,838,315 | `bafc75ec…ec5c` |

The complete gate reverse-applies the patch, checks the exact base tree,
reapplies it, byte-compares the result, syntax-builds all 88 changed paths,
runs 12 adjacent-bundle/source recovery tests, reconstructs the exact bundle,
and compares every reconstructed package member.

```sh
CASE=recovery/cases/2.1.109-to-2.1.110
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.109/package.tgz"
```

Expected status: `complete-recovery-verified`.
