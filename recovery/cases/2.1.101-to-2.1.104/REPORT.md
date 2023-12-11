# Claude Code 2.1.101 → 2.1.104 recovery report

## Result

Claude Code 2.1.104 is complete at the published-code layer.

- The authenticated 2.1.104 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.101 bundle and the exact Zstandard dictionary delta.
- The complete 20-member npm package tree reconstructs exactly. All
  49,184,019 unpacked member bytes, paths, types, modes, and link targets
  match the authenticated target.
- Eighteen members are byte-identical. Only `package/cli.js` and the
  version-only `package/package.json` changed.
- `sdk-tools.d.ts` is byte-identical, so there is no public declaration
  change.
- All 13,501,727 target UTF-16 code units are covered by attribution, and all
  4,317,783 JavaScript tokens are classified.
- A reversible source overlay advances the two defensible API owners from
  the verified 2.1.101 repository state.

The exact original TypeScript tree remains only partially observable because
neither adjacent package contains a source map. The case is therefore labeled
`generated-complete-source-partial`.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, SHA-256 `ca80da60…a3e39` |
| Published package tree | Exact, 20 members and 49,184,019 bytes |
| Public declarations | Unchanged |
| Target generated offsets | 13,501,727 / 13,501,727 |
| Target JavaScript tokens | 4,317,783 / 4,317,783 classified |
| Incremental source overlay | Reversible patch on two paths |
| Original authored spelling | Partially unobservable |

## Published adjacency and Git anomaly

The registry publication sequence is:

```text
2.1.101  2026-04-10T18:41:55.480Z
2.1.102  not published
2.1.103  not published
2.1.104  2026-04-12T02:26:22.100Z
```

The packument lacks both skipped versions, and their exact version and
tarball endpoints return HTTP 404. Thus 2.1.101 → 2.1.104 is one adjacent
published-release step.

Both official lightweight tags resolve to the same commit:

```text
v2.1.101  9772e13f820002c9730af67a2409702799c7ddc6
v2.1.104  9772e13f820002c9730af67a2409702799c7ddc6
```

The tag-to-tag Git diff is empty. That commit adds only the 2.1.101
changelog section; it has no 2.1.104 section, and the 2.1.104 GitHub release
body is blank. The 2.1.101 notes are therefore base/cumulative metadata, not
evidence for the adjacent 2.1.101 → 2.1.104 code delta. The signed npm pair
is the executable oracle, and the canonical attribution intentionally omits
the changelog.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.101 npm tarball | 18,604,746 | `c165d72c2a54d2f1eb9bbd6e2ab1369d5e14a3c46a7bc3b0791227ecaa0c1459` |
| 2.1.101 `cli.js` | 13,566,090 | `bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb` |
| 2.1.104 npm tarball | 18,604,889 | `c94154dadeb8e95fecabf255c1f08f0be2085b2731dc1faafa08c271c48fd2f7` |
| 2.1.104 `cli.js` | 13,567,412 | `ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39` |
| Adjacent `sdk-tools.d.ts` | 117,378 | `9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned shared changelog | 219,187 | `6446550f7fe6286a588ebfe7c13465995418bf0c668f406b4e653edb86a19a32` |

Both npm tarballs pass registry SHA-1, SHA-512 SRI, and ECDSA P-256 signature
verification under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Exact package and generated-code recovery

The exhaustive package report records 18 unchanged and two changed members,
with no additions, removals, or mode-only changes. The target framed
package-tree SHA-256 is:

```text
f8ba1d1fce88baa057d762ddd3d1fb0991cf2af28c2d446e3a8fa2bc1d025d8a
```

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is 1,017,736 bytes with
SHA-256
`70e938e84daf3811df350cfc299addec232a2bc94c89595f536624c39dfaa54c`.
Replay produces the exact 13,567,412-byte target bundle.

The structural ledger classifies 4,238,517 tokens as matched and 79,266 as
conservatively unresolved. No tokens are absent. The complete readable diff
retains every generated change.

## Recovered behavior

The exact bundle delta adds four substantive clusters:

- a byte-level `TransformStream` watchdog around first-party SSE response
  bodies, with a 90-second default, a 15-second minimum, and an unreferenced
  timer;
- a `StreamIdleTimeoutError`, wrapped-response URL preservation, and separate
  `event` and `byte` timeout telemetry tiers;
- a guard that throws after any partial assistant message has been yielded,
  rather than retrying non-streaming and risking duplicate text or tool
  execution; and
- a gated prompt heading change from `# Communication style` to
  `# Text output (does not apply to tool calls)`.

The reversible
[`streaming-idle-and-partial-yield.patch`](./recovered/streaming-idle-and-partial-yield.patch)
places the streaming changes in `src/services/api/client.ts` and
`src/services/api/claude.ts`. The patch has 149 insertions, 25 deletions,
11,791 bytes, and SHA-256
`2b1e28f28c8b7e9394881ea5cad167792c097fd0acf3cb418e922fcc6de5fe71`.

The `anthropicAws` predicate included in the recovered fetch wrapper is a
baseline backfill: it is observable in the 2.1.101 bundle but absent from
this partial readable source tree. The prompt rename remains bundle-only
because the entire preceding experiment function and
`quiet_salted_ember` gate are absent from the source mirror; inventing that
scaffold would overstate source recovery.

## Source lineage and verification

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Verified 2.1.101 base | 1,933 | 30,704,971 | `80d66c4083b2f5c7d783735d1edb766f9bcb6606cbfb9bc099271ed108d9c853` |
| Applied 2.1.104 overlay | 1,933 | 30,708,938 | `bbee2e3a2cf73d5ade12d052c9e5bb43cbc26603f3430b7e3cd6d4d17aff2043` |

The lineage gate reverse-applies the patch, checks the exact base tree,
reapplies it, byte-compares the complete result, Bun-builds both changed
paths, and runs four tests, including an authenticated adjacent-bundle
sentinel comparison.

```sh
CASE=recovery/cases/2.1.101-to-2.1.104
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.101/package.tgz"
```

Expected status: `complete-recovery-verified`.
