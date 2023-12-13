# Claude Code 2.1.110 → 2.1.111 recovery report

## Result

Claude Code 2.1.111 is complete at the published-package and generated-code
layers.

- The authenticated 2.1.111 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.110 bundle and the exact Zstandard dictionary delta.
- The complete 20-member npm package tree reconstructs exactly. All
  49,328,602 unpacked member bytes, paths, types, modes, and link targets
  match the authenticated target.
- Eighteen members are byte-identical. The exhaustive changed set is
  `package/cli.js` and the version-only `package/package.json`; the public
  declarations are unchanged.
- All 13,645,027 target UTF-16 code units are covered by attribution, and all
  4,335,136 target JavaScript tokens are classified.
- A reversible source-facing overlay localizes the defensible 2.1.111
  behaviors in the cumulative source mirror.

Neither adjacent package contains a source map. Exact erased TypeScript
names, types, comments, formatting, and module boundaries remain partially
unobservable, so the case is labeled
`generated-complete-source-partial`.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, SHA-256 `8cd052c0…d0c0` |
| Published package tree | Exact, 20 members and 49,328,602 bytes |
| Public declarations | Exact and unchanged |
| Target generated offsets | 13,645,027 / 13,645,027 |
| Target JavaScript tokens | 4,335,136 / 4,335,136 classified |
| Incremental source overlay | Reversible, target-backed patch |
| Original authored spelling | Partially unobservable |

## Adjacent-release evidence

The executable comparison uses authenticated adjacent npm artifacts for
2.1.110 and 2.1.111:

| Release | npm publication time | Tag commit |
| --- | --- | --- |
| 2.1.110 | `2026-04-15T20:40:53.190Z` | `45ae2f52129b46290af61d0624a8e87eb973f57d` |
| 2.1.111 | `2026-04-16T15:16:09.415Z` | `bf77ee65bc2805d18a7c6fce61fa2b04cdafcf88` |

These are adjacent npm publications, but the Git tags are not in a direct
parent relationship. The public ancestry is:

```text
45ae2f52 → 4fb8aa4e → 5a7bf281 → bf77ee65
```

The two intervening commits and the target tag commit modify only the public
`CHANGELOG.md`; they do not expose the authored implementation. The target
tag's parent is `5a7bf281bab3a1bf37245ea84000b4936322eefa`, and its tree is
`026d0b292faa7c46efd1337b87682373cf4c3a95`. The signed adjacent npm packages
remain the executable authority.

The pinned official 2.1.111 changelog section contains 35 bullets and is
4,627 bytes, SHA-256
`f1d0496097042d2524c7b4756aa01fa4ea6da2ee088c21a64f1c1d61658261db`.
The release covers five broad clusters:

- Opus 4.7, `xhigh` effort, the interactive `/effort` slider, Max-subscriber
  Auto mode, and model/effort fallback behavior;
- terminal and interaction polish: auto terminal theme, skill sorting,
  input clearing, forced redraw, transcript shortcuts, paste/context layout,
  wrapped links, and notification rendering;
- permissions and platform behavior: the PowerShell rollout, read-only glob
  and `cd` command recognition, Windows environment files, and drive-letter
  path normalization;
- commands, setup, plugins, and headless output: typo suggestions,
  prompt-derived plan names, setup model choices, plugin dependency errors,
  `plugin_errors`, the `/ultrareview` command, and the bundled
  less-permission-prompts skill; and
- reliability and observability: raw API body logs, restored fallback retries,
  file-suggestion caching, LSP diagnostic purging, resume/clear/session fixes,
  provider-appropriate 429 messages, skill guidance, and survey coordination.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.110 npm tarball | 18,646,978 | `a9e68dbae2b27893bee13b019cff6417ac9db5947cbc209da1da86b895f76a58` |
| 2.1.110 `cli.js` | 13,609,982 | `cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861` |
| 2.1.111 npm tarball | 18,679,259 | `db1a51e547a465917523bc366fc4180a7a2f5a5c6d4261c03894d0ebfd07ef18` |
| 2.1.111 `cli.js` | 13,711,605 | `8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0` |
| Unchanged declarations | 117,768 | `98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 234,984 | `3ae23affc414a8eae7ec7a0f1a18c57707e49308bc7f6cca823f295d104d9de8` |

Both npm tarballs pass registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature
verification under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Exact package and generated-code recovery

The exhaustive package report records 18 unchanged and two changed members,
with no additions, removals, declaration changes, or mode-only changes. The
target framed-tree SHA-256 is:

```text
410cfb1d65e3924897162a6d682e46882208d71e32626a6001751740c2236bfb
```

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is 2,129,673 bytes with
SHA-256
`2fdd4a69ac99a2db2a0c891a224bf4732c29317225ac53816e82e15d76f290b1`.
Replay produces the exact 13,711,605-byte target bundle. The only other
package change is the unique metadata replacement 2.1.110 → 2.1.111. The
117,768-byte declaration file is byte-identical. The delta preserves the
target's `external-build-2172` provenance stamp.

## Exhaustive generated-code accounting

The attribution inventory retains 4,756 exact 2.1.88 source-owner rows,
4,684 target initializer regions, and 34,366 exhaustive target partitions.
Exact anchors plus partitions account for every target UTF-16 unit.

The structural ledger classifies every target token:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 17,232 | 3,686,452 |
| Moved candidate | 673 | 14,889 |
| Coarse changed candidate | 653 | 275,700 |
| Unresolved pairing | 967 | 358,095 |
| **Total** | **19,525** | **4,335,136** |

`unresolved` means the conservative matcher withheld a 2.1.110 pairing.
Those tokens remain present in the exact target bundle, token ledger, and
complete readable diff. The exact structural fraction is approximately
85.38%, and the resolved structural fraction is approximately 91.74%.

The readable comparison covers 19,458 baseline and 19,525 target statements,
with 13,424 structurally unique pairs, 18,663 accepted bindings, 95,711
identifier edits, and 4,863 rejected unsafe alignments. The comparison
invariant remains
`8e2852eb809c7ea362bc92143a13c2745baf418255614a38104c60a94c066b5c`
through every accepted normalization.

## Source-facing recovery

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is a reversible 1,249,152-byte incremental patch, SHA-256
`6a12b2b9e1817e51de53e54a4605589c7f81a473bb25183b30e846a22bc402ab`.
It affects 81 source paths (two additions), with 2,624 insertions and 1,066
deletions, and localizes target-backed source owners for:

- Opus 4.7 model configuration, `xhigh` effort, the interactive effort
  selector, Auto-mode availability, and compatible-model fallbacks;
- automatic terminal theme selection, skill token-count sorting, transcript
  controls, input clearing, full redraw, context/paste layout, and wrapped-link
  handling;
- PowerShell rollout policy, read-only command globs, prompt-derived plan
  filenames, Windows environment handling, and drive-root permissions;
- raw API-body OpenTelemetry events, provider-specific 429 guidance,
  restored fallback behavior, terminal notification escaping, suggestion
  caching, and stale LSP-diagnostic purging; and
- `/ultrareview` preflight and billing confirmation, dynamic cost/duration/
  model configuration, branch/PR scope, source tags, and bundle fork-point
  preservation; and
- session-title preservation, resume completion, plugin-error reporting,
  corrected SkillTool guidance, the exact target-literal body of the bundled
  less-permission-prompts skill, and the other source-placeable release fixes.

The generated/package layer remains the complete claim. The
less-permission-prompts body is recovered exactly from its target bundle
literal into the defensible bundled-skill owner; `/ultrareview` is a command,
not a second skill. The `/setup-vertex` and `/setup-bedrock` improvements
remain generated-only because their wizard scaffold is absent from the
cumulative mirror. The ultrareview SDK handler is adapted to this mirror's
`getAppState`/`setAppState` task context because the target's broader
task-registry refactor is absent; its generic cloud-environment fallback and
animated launch indicator likewise remain generated-only. Any other behavior
whose original module placement is absent remains exact in the recovered
generated bundle, not invented as authored TypeScript.

## Source lineage and verification

The complete gate reverse-applies the overlay, checks the exact 2.1.110 base
tree, reapplies it, byte-compares the result, syntax-builds every changed
source path, runs focused adjacent-bundle/source tests, reconstructs the exact
bundle, and compares every reconstructed package member.

| Source tree | Files | Bytes | Framed manifest SHA-256 |
| --- | ---: | ---: | --- |
| Verified 2.1.110 base | 1,948 | 30,838,315 | `bafc75ec5e54272ef4350e0e7600600d1a28d7e2c379ee403c7e1dde1b38ec5c` |
| Recovered 2.1.111-facing target | 1,950 | 30,859,073 | `9599bad7f1d9cb0fddb2abde183d3800c60ebf413c9a6a027be41a8aecfb6644` |

The focused suite contains 26 source/adjacent-bundle assertions, including an
exact decoded comparison of the complete less-permission-prompts body.

```sh
CASE=recovery/cases/2.1.110-to-2.1.111
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.110/package.tgz"
```

Expected status: `complete-recovery-verified`.
