# Claude Code 2.1.100 → 2.1.101 recovery report

## Result

The recoverable Claude Code 2.1.101 release is complete at the published-code
layer.

- The authenticated 2.1.101 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.100 bundle and the case's exact Zstandard dictionary
  delta.
- The complete 20-member npm package tree reconstructs exactly. All
  49,182,697 unpacked member bytes, paths, types, link targets, and modes
  match the authenticated target archive.
- Eighteen members are byte-identical. The exhaustive changed set is
  `package/cli.js` and the version-only `package/package.json`.
- The adjacent `sdk-tools.d.ts` files are byte-identical, so this package has
  no public declaration change and requires no declaration delta.
- Every one of the target bundle's 13,500,405 UTF-16 code units is covered by
  the attribution inventory.
- Every one of its 4,317,367 JavaScript tokens is classified.
- The binding-aware readable comparison covers the complete bundle.
- A reversible, target-backed source overlay advances 16 defensible owners
  from the verified 2.1.100 repository state.

The exact original 2.1.101 TypeScript tree is not uniquely recoverable.
Neither adjacent npm package contains a target source map. Names, types,
comments, formatting, and some authored module boundaries were erased by the
build. The case is therefore labeled `generated-complete-source-partial`:
the published executable and package tree are exact, while TypeScript changes
are applied only where the generated target supports a defensible placement.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, target SHA-256 `bacffcb4…09eb` |
| Published package tree | Exact, 20 members and 49,182,697 bytes |
| Public declarations | Unchanged and byte-identical |
| Target generated offsets | Complete, 13,500,405 / 13,500,405 UTF-16 units |
| Target JavaScript tokens | Complete classification, 4,317,367 / 4,317,367 |
| Full readable bundle diff | Complete comparison view |
| Incremental repository source | Partial, one reversible patch on 16 paths |
| Original authored 2.1.101 spelling | Partially unobservable |

## Published-version adjacency

`2.1.101` is the next published npm version after `2.1.100`.

```text
2.1.100  published 2026-04-10T05:00:41.623Z
2.1.101  published 2026-04-10T18:41:55.480Z
```

The official tags resolve as follows:

```text
v2.1.100  c5600e0b1e9bb6ddf750cf7441c4d4fffbb7c917
v2.1.101  9772e13f820002c9730af67a2409702799c7ddc6
```

The target commit's sole parent is the baseline commit, independently
confirming direct tag lineage. All exact deltas, member comparisons,
structural pairings, and readable comparisons are therefore directly
2.1.100 → 2.1.101.

The official changelog pinned at the target commit contains a 2.1.101
section with 46 bullets. That section is useful provenance and a semantic
locator, but it does not replace adjacent artifact comparison. A release-note
bullet is not counted as a recovered adjacent change unless the exact
2.1.100/2.1.101 bundle or package comparison supports it. In particular, the
`/team-onboarding` command, API-timeout behavior, and
numeric-environment-value handling are already present in the authenticated
2.1.100 bundle, and the Agent SDK `query()` cleanup belongs to a separately
shipped SDK artifact. Forty-six bullets therefore do not imply 46 localized
TypeScript edits in this repository.

## Baseline roles

This case keeps two baselines separate:

1. **2.1.100 is the adjacent generated baseline.** Exact bundle,
   declaration, package, structural, and readable comparisons are all
   2.1.100 → 2.1.101.
2. **2.1.88 is the source-ownership oracle.** Its matching bundle and source
   map identify exact baseline ownership for attribution.

The 2.1.88 map is never applied directly to 2.1.100 or 2.1.101 offsets.
Target source identities are ranked evidence, not exact source-map mappings.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.100 npm tarball | 18,573,250 | `0e48a9da69db72f92cf126d9541a976a36918b549011e98dd880e21f195aa9b0` |
| 2.1.100 `cli.js` | 13,468,528 | `d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be` |
| 2.1.101 npm tarball | 18,604,746 | `c165d72c2a54d2f1eb9bbd6e2ab1369d5e14a3c46a7bc3b0791227ecaa0c1459` |
| 2.1.101 `cli.js` | 13,566,090 | `bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb` |
| Adjacent `sdk-tools.d.ts` | 117,378 | `9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 219,187 | `6446550f7fe6286a588ebfe7c13465995418bf0c668f406b4e653edb86a19a32` |

Both npm tarballs pass their registry SHA-1, SHA-512 SRI, and ECDSA P-256
signature checks under registry key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`. The key's SPKI SHA-256 is
`fb190a462123443500cbcdb6519623e7179e9f38d84ad4e9362b72d2b68b62c1`.
The exhaustive authenticated comparison is stored in
[`package-members.json`](./package-members.json).

## Package-member diff

| Status | Members |
| --- | ---: |
| Unchanged | 18 |
| Changed | 2 |
| Added | 0 |
| Removed | 0 |
| Mode-only changed | 0 |

The changed set is exhaustive:

- `package/cli.js` grows by 97,562 bytes, from 13,468,528 to 13,566,090.
- `package/package.json` remains 1,371 bytes and changes only the version
  from 2.1.100 to 2.1.101.

`package/sdk-tools.d.ts`, every native executable, seccomp helper, ripgrep
binary, license, and readme are byte-identical. The exact target framed
package-tree SHA-256 is:

```text
31db03d726238058bb691208a6e0c3698ff0e2384c1ef7c4d9a5925e5736d154
```

## Exact generated-code recovery

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is a deterministic
Zstandard dictionary patch:

| Input/output | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.100 baseline bundle | 13,468,528 | `d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be` |
| Delta | 2,096,082 | `afebd886bd0b9fa19862e9d6dab101ab32b014508c9bec8772853a0a8da22088` |
| Reconstructed 2.1.101 bundle | 13,566,090 | `bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb` |

The package reconstructor applies that delta, uniquely changes the package
version, copies the 18 unchanged members with their target modes, and
byte-compares all 20 outputs with the authenticated target.

## Exhaustive generated-code accounting

The source oracle contains 4,756 sources, 2,068,722 mapped segments, 4,756
contiguous ownership runs, and 4,527 Bun initializer regions. The target has
4,627 Bun initializer regions; the adjacent 2.1.100 report records 4,604.

The attribution inventory contains 39,866 monotone exact anchors and 39,867
between-anchor partitions:

| Partition status | Partitions | Target UTF-16 units |
| --- | ---: | ---: |
| Exact generated | 19,705 | 468,881 |
| Changed, high confidence | 17,738 | 5,127,924 |
| Changed candidate | 2,418 | 5,687,966 |
| Unresolved attribution | 6 | 1,897 |
| **Partition total** | **39,867** | **11,286,668** |

The exact anchors cover the remaining 2,213,737 units. Together they account
for all 13,500,405 target UTF-16 units, leaving zero unaccounted.

The structural ledger classifies every target token:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,388 | 3,754,276 |
| Moved candidate | 1,167 | 21,923 |
| Coarse changed candidate | 134 | 36,589 |
| Unresolved pairing | 1,221 | 504,579 |
| **Total** | **18,910** | **4,317,367** |

Of the moved candidates, 16,407 tokens in 75 units have unique placement;
5,516 tokens in 1,092 units are duplicate-ambiguous. `unresolved` means the
conservative matcher withheld a 2.1.100 pairing. Those tokens are not
missing: they remain in the exact target bundle, structural ledger, and full
readable comparison.

## Readable full-bundle diff

[`readable-diff/normalized.diff.gz`](./readable-diff/normalized.diff.gz)
contains the complete Git-style comparison after conservative Program-scope
binding alignment. It records:

- 12,689 structurally unique statement pairs;
- 17,737 accepted binding alignments plus 126 already-equal bindings;
- 97,322 identifier edits; and
- 4,673 rejected unsafe alignments.

The target comparison-invariant hash is
`f242ae22a14c5b61c62d7fde39a56477a0888fc4b460ec9d7376db739951e4e2`
before alpha rename, after rename, and after statement normalization. The
5,554,934-byte canonical gzip has SHA-256
`257b0d946ec83133ab04440c5d939d0255c0a73a7a7774a75b8f9629b359e9c9`.
This is a checked, non-executable comparison representation; the executable
oracle remains the exact reconstructed bundle.

## Source-facing recovery

The consolidated reversible source patch is
[`recovered/security-resume-and-runtime.patch`](./recovered/security-resume-and-runtime.patch).
It changes 16 existing paths with 407 insertions and 229 deletions. Its
defensible, adjacent-target-backed clusters are:

- replace `VirtualMessageList`'s captured render closure with a current ref,
  avoiding retention of historical message-list closures;
- add the focus-mode system-prompt section and update long-thinking progress
  to five milestones at 30, 60, 90, 150, and 240 seconds;
- recognize raw C0 `ctrl+\`, `ctrl+]`, and `ctrl+^` key sequences;
- support `CLAUDE_CODE_CERT_STORE`, default to bundled plus system
  certificate stores, deduplicate certificates, classify the variable as
  provider-managed, and emit startup certificate-store telemetry;
- include API refusal `stop_details` explanations, capped at 400 characters,
  with explanation-presence telemetry;
- isolate Bedrock SigV4 from default `Authorization` headers while preserving
  explicit bearer and skip-auth paths, with adjacent provider/model cleanup;
- make permission deny rules override hook `ask` and `allow` outcomes by
  retaining the full rule/safety pipeline;
- await image-cache cleanup and suppress retention cleanup when the user
  settings source is disabled and no enabled source supplies
  `cleanupPeriodDays`;
- resolve and validate system ripgrep paths, fall back from a stale embedded
  path, and clear memoized state after `ENOENT`;
- preserve sidechain parity while bridging session chains and select the last
  live main-chain leaf rather than an unrelated or dead-end branch;
- provide actionable validation guidance for unrecognized hook events; and
- replace shell-interpolated executable discovery with argv-safe POSIX and
  Windows lookup, including absolute-path and current-directory handling.

The patch is 250,755 bytes with SHA-256:

```text
a9ef6896211e558bab6b0063fe34b0875b8b598216e4ef3d1fdd1cd78a0aa802
```

## Bundle-only changes and limits

The exact bundle delta preserves every generated 2.1.101 change, including
changes for which the authored TypeScript owner cannot be established
without speculation. Two important examples remain deliberately bundle-only:

- **settings signal:** in-app settings writes refresh the in-memory settings
  snapshot so removals can take effect during the session; and
- **brief retry:** brief mode retries once when the model emits plain text
  instead of the expected structured message.

Other adjacent generated changes that could not be assigned to an existing
owner with the same confidence also remain bundle-only. The readable diff,
structural ledger, attribution partitions, and exact reconstructed bundle
retain and verify them; no speculative source file, name, or module boundary
is invented.

Conversely, the 46-bullet changelog is not treated as a list of 46 adjacent
CLI changes. Behaviors already present in 2.1.100 and changes shipped in
other artifacts are not falsely added to the source overlay.

## Source lineage

The source patch is independently pinned:

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Recovered 2.1.100 base | 1,933 | 30,699,758 | `47eb501c55779f8661dcd50c6b86c298fd85711ebe81300dd43b0a1539d58dad` |
| Applied 2.1.101 overlay | 1,933 | 30,704,971 | `80d66c4083b2f5c7d783735d1edb766f9bcb6606cbfb9bc099271ed108d9c853` |

The lineage gate reverse-applies the patch to reproduce the exact 2.1.100
source tree, reapplies it, byte-compares the complete result with the
repository, Bun-builds all 16 changed source paths, and runs five
target-backed semantic tests. The base is additionally pinned to commit
`a8e39191fe9098c7750f6d55190502a760d5f7d9` and Git tree
`c19e46029d1f5e75e67b25203b10ac093fdded6f`.

This gate proves reproducibility of the chosen source overlay. It does not
upgrade that overlay into a claim that the complete original TypeScript tree
was recovered.

## Verification

Acquire immutable evidence and run the aggregate gate:

```sh
CASE=recovery/cases/2.1.100-to-2.1.101
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.100/package.tgz"
```

Expected result:

```text
status          complete-recovery-verified
bundle bytes    13566090
bundle sha256   bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb
package members 20
package bytes   49182697
package sha256  31db03d726238058bb691208a6e0c3698ff0e2384c1ef7c4d9a5925e5736d154
source files    1933
semantic tests  5
```

For the complete construction procedure, see
[`RECOVERY_RUNBOOK.md`](./RECOVERY_RUNBOOK.md).
