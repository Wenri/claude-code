# Claude Code 2.1.107 → 2.1.108 recovery report

## Result

Claude Code 2.1.108 is complete at the published-package and generated-code
layers.

- The authenticated 2.1.108 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.107 bundle and the exact Zstandard dictionary delta.
- The complete 20-member npm package tree reconstructs exactly. All
  49,159,703 unpacked member bytes, paths, types, modes, and link targets
  match the authenticated target.
- Eighteen members are byte-identical. The exhaustive changed set is
  `package/cli.js` and the version-only `package/package.json`;
  `package/sdk-tools.d.ts` is unchanged.
- All 13,476,768 target UTF-16 code units are covered by attribution, and all
  4,302,522 target JavaScript tokens are classified.
- A reversible source-facing overlay localizes 22 target-backed release-note
  behaviors across 24 source paths.

The original authored TypeScript remains only partially observable because
neither adjacent published package contains a source map. The case is
therefore labeled `generated-complete-source-partial`.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, SHA-256 `dc82842f…fe73` |
| Published package tree | Exact, 20 members and 49,159,703 bytes |
| Public declarations | Exact, byte-identical |
| Target generated offsets | 13,476,768 / 13,476,768 |
| Target JavaScript tokens | 4,302,522 / 4,302,522 classified |
| Incremental source overlay | Reversible patch on 24 paths |
| Original authored spelling | Partially unobservable |

## Adjacent-release evidence

The executable comparison uses the authenticated adjacent npm artifacts for
2.1.107 and 2.1.108. The pinned official changelog contains 24 bullets for
2.1.108 and is used as a semantic locator, not as the executable oracle.

Registry and Git history independently establish that the releases are
adjacent:

| Release | npm publication time | Tag commit |
| --- | --- | --- |
| 2.1.107 | `2026-04-14T05:18:14.905Z` | `194736a4bd11d8329974978abab33019aaad64f1` |
| 2.1.108 | `2026-04-14T18:35:26.902Z` | `5c18c787f262242a4266a12d2d1123808394fbce` |

The 2.1.108 tag commit has the 2.1.107 tag commit as its sole parent. Its Git
diff changes only the changelog, with 27 insertions. That public repository
history establishes release adjacency but does not expose the authored
implementation delta, so the authenticated npm artifacts remain the
executable oracle.

Two of those release notes do not represent an incremental generated change
between these packages:

- `/recap`, its configuration, environment override, command, prompt, and UI
  were already present in both adjacent bundles; and
- current-directory filtering in the `/resume` picker, with `Ctrl+A` to show
  all projects, was already present in both adjacent bundles.

The source-facing overlay therefore localizes 22 release-note behaviors, not
24. The signed published npm artifacts remain the authority for every byte.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.107 npm tarball | 18,646,371 | `447f42addc14dadf679873899b9758f7f09ec723c3de9787d5493070561842e7` |
| 2.1.107 `cli.js` | 13,678,154 | `6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844` |
| 2.1.108 npm tarball | 18,621,246 | `be20b29860d7d708043eedf9a36bb1422e5094e7de427cbcbca4068b00e0d9b8` |
| 2.1.108 `cli.js` | 13,542,838 | `dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73` |
| Unchanged `sdk-tools.d.ts` | 117,636 | `434bd6609ce22b3bf749793a988e796108f28151c6307c840e5c1427c4ccd928` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 226,422 | `29e7f2537800287ec780c78fe6be6b993654192d41240f5dd13b2e431b7ec454` |

Both npm tarballs pass registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature
verification under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Exact package and generated-code recovery

The exhaustive package report records 18 unchanged and two changed members,
with no additions, removals, or mode-only changes. The target framed
package-tree SHA-256 is:

```text
277fff5e219e13fc935cc079a30b0e07818e5dc98e4f3eb1682a1dbf60048ba6
```

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is 2,152,865 bytes with
SHA-256
`da4d79c4d04d888c1d634d7600609d09bac219fb8ad503783a3c5d33ef6797bc`.
Replay produces the exact 13,542,838-byte target bundle.

The package metadata change is independently reproducible as the version
replacement 2.1.107 → 2.1.108. The public declarations are copied unchanged
from the authenticated baseline and byte-compared with the authenticated
target. The exact delta also preserves the target's `external-build-2203`
provenance stamp; that generated-only change is deliberately not assigned an
authored-source owner.

## Exhaustive generated-code accounting

The source-attribution inventory retains 4,756 exact 2.1.88 source-owner
rows, 4,657 target initializer regions, and 39,006 exhaustive target
partitions. The source map is used only to identify exact 2.1.88 owners; no
2.1.88 offset is projected onto either adjacent package. Exact anchors plus
partitions account for every target UTF-16 unit.

The structural ledger classifies every target token:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 15,839 | 3,632,808 |
| Moved candidate | 1,542 | 119,438 |
| Coarse changed candidate | 445 | 121,605 |
| Unresolved pairing | 1,448 | 428,671 |
| **Total** | **19,274** | **4,302,522** |

`unresolved` means the conservative matcher withheld a 2.1.107 pairing. Those
tokens are not missing: they remain in the exact target bundle, token ledger,
and complete readable diff. The exact structural fraction is approximately
87.21%, and the resolved structural fraction is approximately 90.04%.

The readable comparison records 13,131 structurally unique statement pairs,
17,858 accepted target-to-baseline bindings, 94,413 identifier edits, and
5,230 rejected unsafe alignments. The target comparison-invariant hash remains
`a18dff8c3e895fd98da354aa6c7f4dd9cd30bfc61610ab4d13c22bcd05197cd1`
through every normalization stage.

## Partial source-facing recovery

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is a reversible 568,467-byte patch with 1,173 insertions, 308 deletions, and
SHA-256
`221665eec1d52156ec56c55c24f85b67755815adfb720aa030bd4b514f0e0f9c`.
It localizes these 22 target-backed release-note behaviors across 24 paths:

1. provider-wide one-hour prompt-cache opt-in, the deprecated Bedrock opt-in,
   and the forced five-minute override;
2. built-in slash-command discovery through the Skill tool, with explicit
   guidance when a non-prompt command cannot be invoked as a skill;
3. `/undo` as an alias for `/rewind`;
4. the mid-conversation model-switch cache-miss warning;
5. clearer server-rate-limit, 5xx/529 status, and unknown-command suggestion
   messages;
6. on-demand syntax-grammar loading for highlighting used by file reads and
   edits;
7. the detailed-transcript `verbose` indicator;
8. the startup warning for `DISABLE_PROMPT_CACHING*`;
9. pasted text fallback in the `/login` code prompt;
10. the subscriber one-hour cache allowlist fallback when telemetry is
    disabled;
11. auto-mode permission handling when the Agent safety classifier exceeds
    its context window;
12. Bash environment-file handling when the last line is a `#` comment;
13. preservation of custom session name and color for
    `claude --resume <session-id>`;
14. suppression of placeholder example text in titles for short greetings;
15. filtering of terminal escape responses after `--teleport`;
16. Enter-to-retry behavior after `/feedback` submission failure;
17. visible `--teleport` and `--resume <id>` precondition errors;
18. preservation of Remote Control titles set by the web UI;
19. self-referencing transcript handling during `--resume`;
20. logging of transcript write failures;
21. language guidance that preserves diacritical marks; and
22. project-independent auto-update checks for policy-managed plugins.

The exact strings, literals, predicates, and control-flow evidence come from
the authenticated target bundle. Function names, types, imports, comments,
formatting, and exact original module boundaries remain source-facing
inference where the build erased them. This overlay is not a claim that the
original 2.1.108 TypeScript tree has been recovered exactly.

## Source lineage and verification

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Verified 2.1.107 base | 1,933 | 30,720,127 | `a7daf57d…82b7` |
| Applied 2.1.108 overlay | 1,933 | 30,748,085 | `9123013c…e96` |

The complete gate reverse-applies the patch, checks the exact base tree,
reapplies it, byte-compares the result, syntax-builds all 24 changed paths,
runs the target-backed recovery test, reconstructs the exact bundle, and
compares every reconstructed package member.

```sh
CASE=recovery/cases/2.1.107-to-2.1.108
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.107/package.tgz"
```

Expected status: `complete-recovery-verified`.
