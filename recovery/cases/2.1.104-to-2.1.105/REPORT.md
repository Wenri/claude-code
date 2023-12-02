# Claude Code 2.1.104 → 2.1.105 recovery report

## Result

Claude Code 2.1.105 is complete at the published-code layer.

- The authenticated 2.1.105 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.104 bundle and the exact Zstandard dictionary delta.
- The complete 20-member npm package tree reconstructs exactly. All
  49,293,780 unpacked member bytes, paths, types, modes, and link targets
  match the authenticated target.
- Seventeen members are byte-identical. The exhaustive changed set is
  `package/cli.js`, `package/sdk-tools.d.ts`, and the version-only
  `package/package.json`.
- The declaration change is independently reproducible as one unique ordered
  edit adding `EnterWorktreeInput.path`.
- All 13,610,973 target UTF-16 code units are covered by attribution, and all
  4,354,381 JavaScript tokens are classified.
- A reversible source-facing overlay advances 28 defensible owners from the
  verified 2.1.104 repository state.

The exact original TypeScript tree remains only partially observable because
neither adjacent package contains a source map. The case is therefore labeled
`generated-complete-source-partial`.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, SHA-256 `8bc6a637…03f75` |
| Published package tree | Exact, 20 members and 49,293,780 bytes |
| Public declarations | Exact one-edit reconstruction |
| Target generated offsets | 13,610,973 / 13,610,973 |
| Target JavaScript tokens | 4,354,381 / 4,354,381 classified |
| Incremental source overlay | Reversible patch on 28 paths |
| Original authored spelling | Partially unobservable |

## Published adjacency

The registry and official Git history independently establish a direct
published-release step:

```text
2.1.104  2026-04-12T02:26:22.100Z  9772e13f820002c9730af67a2409702799c7ddc6
2.1.105  2026-04-13T19:51:19.552Z  550aeecc9780f6334c25d5df7ce1a24830278843
```

The target tag commit has the 2.1.104 tag commit as its sole parent. Its Git
diff adds the 37-bullet 2.1.105 changelog section. Release notes are used as
semantic locators only; the signed adjacent npm artifacts remain the
executable oracle.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.104 npm tarball | 18,604,889 | `c94154dadeb8e95fecabf255c1f08f0be2085b2731dc1faafa08c271c48fd2f7` |
| 2.1.104 `cli.js` | 13,567,412 | `ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39` |
| 2.1.105 npm tarball | 18,645,640 | `b42020694fdbdd216a1257e5aefe7bd893803c74454f872884fb09b675cafb88` |
| 2.1.105 `cli.js` | 13,676,915 | `8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75` |
| 2.1.105 `sdk-tools.d.ts` | 117,636 | `434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 223,437 | `94f4bf1d27b1ff557c422db8453f96d1aadb9021f6d94d90801492d51786f022` |

Both npm tarballs pass registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature
verification under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Exact package and generated-code recovery

The exhaustive package report records 17 unchanged and three changed members,
with no additions, removals, or mode-only changes. The target framed
package-tree SHA-256 is:

```text
eb72a564decf7f00f8ba598bc7d3d8ecec452d1f220ff07e1fbcafd7184e110a
```

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is 2,157,702 bytes with
SHA-256
`615daafb1b4c92d98e9339ee8d9c40104fed840eb1c2b2b64186cf30823f24f0`.
Replay produces the exact 13,676,915-byte target bundle.

[`diff/sdk-tools.d.ts.zstd-delta`](./diff/sdk-tools.d.ts.zstd-delta) is 161
bytes with SHA-256
`524facc8fdf17509decbfab10e21dac1dce89808d5d665608839ab98316e33b6`.
The declaration verifier independently applies one unique replacement to
`EnterWorktreeInput`: `name` is clarified as creating a new worktree, the
mutual-exclusion rule is documented, and `path?: string` is added for entering
an existing registered worktree.

## Exhaustive accounting

The source-attribution inventory retains 4,756 exact baseline source-owner
rows, 4,664 target initializer regions, and 38,092 exhaustive target
partitions. Exact anchors plus partitions account for every target UTF-16
unit.

The structural ledger classifies every target token:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 13,477 | 3,229,962 |
| Moved candidate | 2,880 | 386,282 |
| Coarse changed candidate | 621 | 143,168 |
| Unresolved pairing | 2,142 | 594,969 |
| **Total** | **19,120** | **4,354,381** |

`unresolved` means the conservative matcher withheld a 2.1.104 pairing. Those
tokens are not missing: they remain in the exact target bundle, token ledger,
and complete readable diff.

The readable comparison records 12,568 structurally unique statement pairs,
16,843 accepted target-to-baseline bindings, 85,789 identifier edits, and
5,428 rejected unsafe alignments. The target comparison-invariant hash remains
`b3f6ebf80ab8b5583de5eb890bde5e383e202c86d2e805c2a1e5610fe5cfeaa0`
through every normalization stage.

## Source-facing recovery

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is a reversible 396,606-byte patch with 462 insertions, 231 deletions, and
SHA-256
`f5c8a43b2794c2e1d413ad54b48b256f7404bc9a9cd0a94ceceb5f7da8c918f7`.
It localizes the following target-backed behavior:

- existing-worktree entry and safe non-removal, including transcript state;
- blocking `PreCompact` hooks across manual, automatic, and teammate paths;
- the default-on five-minute stream watchdog and non-content WebFetch cleanup;
- visual-row FileWrite truncation and immediate network retry messages;
- `/proactive` as a `/loop` alias, schema-backed keybinding validation, and
  the 1,536-character skill-description listing cap;
- one-shot cron cleanup safety and stdio MCP fast failure; and
- suppression of permission-mode downgrade suggestions after plan mode.

The exact bundle also contains broader plugin-monitor, marketplace dependency,
doctor, channel-handler, managed-agent documentation, and UI changes. Those
bytes are completely recovered by the executable delta, but their exact
authored TypeScript boundaries are not claimed in the partial source mirror.

## Source lineage and verification

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Verified 2.1.104 base | 1,933 | 30,708,938 | `bbee2e3a…2043` |
| Applied 2.1.105 overlay | 1,933 | 30,718,359 | `85881766…c27a` |

The complete gate reverse-applies the patch, checks the exact base tree,
reapplies it, byte-compares the result, Bun-builds all 28 changed paths, runs
10 target-backed tests, reconstructs the exact declaration and bundle, and
compares every reconstructed package member.

```sh
CASE=recovery/cases/2.1.104-to-2.1.105
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.104/package.tgz"
```

Expected status: `complete-recovery-verified`.
