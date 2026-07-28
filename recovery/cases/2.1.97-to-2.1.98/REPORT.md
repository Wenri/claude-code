# Claude Code 2.1.97 → 2.1.98 recovery report

## Result

The recoverable Claude Code 2.1.98 release is complete at the published-code
layer.

- The authenticated 2.1.98 `cli.js` reconstructs byte-for-byte from the
  authenticated 2.1.97 bundle and the case's exact Zstandard dictionary
  delta.
- The complete 20-member npm package tree reconstructs exactly. All
  49,087,707 unpacked member bytes, paths, types, and modes match the
  authenticated target archive.
- Eighteen members are byte-identical. The exhaustive changed set is
  `cli.js` and the version-only `package.json`.
- The adjacent `sdk-tools.d.ts` files are byte-identical, so this release has
  no public declaration change and requires no declaration delta.
- Every one of the target bundle's 13,405,677 UTF-16 code units is covered by
  the attribution inventory.
- Every one of its 4,290,788 JavaScript tokens is classified.
- The binding-aware readable comparison covers the complete bundle.
- A reversible, target-backed source-facing overlay advances the repository
  from its verified 2.1.97 source state to the recovered 2.1.98 state.

The exact original 2.1.98 TypeScript tree is not uniquely recoverable.
Neither adjacent package contains a source map. Names, types, comments,
formatting, and some authored module boundaries were erased by the build.
The case is therefore labeled `generated-complete-source-partial`: the
published executable and package tree are exact, while TypeScript changes are
applied only where the generated target supports a defensible placement.

| Layer | Result |
| --- | --- |
| Published `cli.js` | Exact, target SHA-256 `27782951…3556` |
| Published package tree | Exact, 20 members and 49,087,707 bytes |
| Public declarations | Unchanged and byte-identical |
| Target generated offsets | Complete, 13,405,677 / 13,405,677 UTF-16 units |
| Target JavaScript tokens | Complete classification, 4,290,788 / 4,290,788 |
| Full readable bundle diff | Complete comparison view |
| Incremental repository source | Partial, one reversible patch on 13 paths |
| Original authored 2.1.98 spelling | Partially unobservable |

## Published-version adjacency

`2.1.98` is the next published npm version after `2.1.97`. It was published
at `2026-04-09T18:08:49.739Z`. The official lightweight GitHub tag
`v2.1.98` resolves to commit
`c5600e0b1e9bb6ddf750cf7441c4d4fffbb7c917`, and the changelog pinned at that
commit advances directly from 2.1.98 to 2.1.97.

All exact deltas, member comparisons, structural pairings, and readable
comparisons are therefore directly 2.1.97 → 2.1.98.

## Baseline roles

This case keeps two baselines separate:

1. **2.1.97 is the adjacent generated baseline.** Exact bundle, declaration,
   package, structural, and readable comparisons are all 2.1.97 → 2.1.98.
2. **2.1.88 is the source-ownership oracle.** Its matching bundle and source
   map identify exact baseline ownership for attribution.

The 2.1.88 map is never applied directly to 2.1.97 or 2.1.98 offsets.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL, byte length, and
SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.97 npm tarball | 18,546,637 | `59df8e883edd0925bcb73407f974d0138c39106b744b8e6453ff23e3154b9a8a` |
| 2.1.97 `cli.js` | 13,375,388 | `4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988` |
| 2.1.98 npm tarball | 18,574,200 | `a536437ce8a79c1908bc73a197fa9c86497fa2757121a6f6236cd439228c0b7b` |
| 2.1.98 `cli.js` | 13,471,101 | `27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556` |
| Adjacent `sdk-tools.d.ts` | 117,378 | `9cb15df6a2108f277401925acc55c2eb881f6bfe5ef6ad1fc737fa64b22ca8fe` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 212,809 | `5e847610e0030533e2c1b80741b9842a331c404617b9902397b45a70e0f85f14` |

Both npm tarballs pass their registry SHA-1, SHA-512 SRI, and ECDSA P-256
signature checks under registry key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`. The key's SPKI SHA-256 is
`fb190a462123443500cbcdb6519623e7179e9f38d84ad4e9362b72d2b68b62c1`.
The exhaustive result is stored in
[`package-members.json`](./package-members.json).

The pinned changelog has one 2.1.98 section with 57 bullets. It is release
evidence, not a substitute for bundle or package comparison.

## Package-member diff

| Status | Members |
| --- | ---: |
| Unchanged | 18 |
| Changed | 2 |
| Added | 0 |
| Removed | 0 |
| Mode-only changed | 0 |

The changed set is exhaustive:

- `package/cli.js` grows by 95,713 bytes.
- `package/package.json` changes only the version from 2.1.97 to 2.1.98.

`package/sdk-tools.d.ts`, every native executable, seccomp helper, ripgrep
binary, license, and readme are byte-identical. The exact target
package-tree SHA-256 is:

```text
850b956fe51eb41bb07b0a3fcc59b1c18cf3aa7cb06bab6961d0d290c096c8f0
```

## Exact generated-code recovery

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is a deterministic
Zstandard dictionary patch:

| Input/output | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.97 baseline bundle | 13,375,388 | `4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988` |
| Delta | 2,383,732 | `12ec0a9f269c9fe3b6653ef06887dcfb5d8bd56503201ed0994beb0bf0d4a7f3` |
| Reconstructed 2.1.98 bundle | 13,471,101 | `27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556` |

The package reconstructor applies that delta, uniquely changes the package
version, copies the 18 unchanged members with their target modes, and
compares all 20 outputs with the authenticated target.

## Exhaustive generated-code accounting

The source oracle contains 4,756 sources and 2,068,722 mapped segments. The
attribution inventory records 4,604 target initializer regions, 39,998
target partitions, and 39,997 exact anchors. Partitions plus exact anchors
cover all 13,405,677 target UTF-16 code units, leaving zero unaccounted.

The structural ledger classifies every target token:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,239 | 3,790,364 |
| Moved candidate | 1,233 | 6,498 |
| Coarse changed candidate | 233 | 68,270 |
| Unresolved pairing | 1,043 | 425,656 |
| **Total** | **18,748** | **4,290,788** |

`unresolved` means the conservative matcher withheld a 2.1.97 pairing. Those
tokens are still present in the exact bundle, structural ledger, and readable
full-bundle diff.

## Readable full-bundle diff

[`readable-diff/normalized.diff.gz`](./readable-diff/normalized.diff.gz)
contains the complete Git-style comparison after conservative Program-scope
binding alignment. It records:

- 12,790 structurally unique statement pairs;
- 18,321 accepted binding alignments;
- 100,559 identifier edits; and
- 4,353 rejected unsafe alignments.

The target comparison-invariant hash is identical before alpha rename, after
rename, and after statement normalization. This is a checked comparison
representation, not executable or authored source.

## Source-facing recovery

The consolidated reversible patch is
[`recovered/perforce-permissions-and-runtime.patch`](./recovered/perforce-permissions-and-runtime.patch).
Its defensible clusters are:

- Perforce-mode detection, read-only enforcement for Edit, Write, and
  NotebookEdit, and matching workspace context;
- Bash read-only permission hardening for grep aliases, attached flags,
  `xargs`, `printf -v`, `[[ ... ]]`, `find`, newline checks, and bracketed
  glob scanning;
- LSP `clientInfo` identity;
- `DISABLE_COMPACT` context sizing, warnings, and suggestion behavior; and
- shifted uppercase input under the kitty keyboard protocol.

The source patch changes 13 existing paths. Eighteen unique target fragments
bind these behaviors to the authenticated bundle, and two focused test files
exercise the source shape and adjacent baseline/target behavior.

The retained internal-only `USER_TYPE === 'ant'` context-window arm comes from
the verified source oracle. The external build eliminates that arm, leaving
the exact published 2.1.98 `DISABLE_COMPACT` residual. Removing the internal
arm would be an unsupported authored-source claim.

Large target-only additions such as the Vertex AI setup wizard, Monitor tool,
and subprocess sandbox remain exact in the published bundle recovery rather
than being assigned invented authored paths. The dynamic-system-prompt flag
and other release changes without uniquely defensible source placement are
handled the same way.

The source lineage is independently pinned:

| Tree | Files | Bytes | Framed SHA-256 |
| --- | ---: | ---: | --- |
| Recovered 2.1.97 base | 1,933 | 30,696,402 | `62292e92d77b622cf5290282387921c1464a35d8bac8b1d7c312d7bd03a0c289` |
| Applied 2.1.98 overlay | 1,933 | 30,702,094 | `781e5ebbb94fc3dffaf2121db9bae55aed8ad12efeb0579919822094fe499a9b` |

The lineage gate reverse-applies the patch to reproduce the exact 2.1.97
tree, reapplies it, byte-compares the result with the repository, Bun-builds
all 13 changed source paths, and runs nine target-backed semantic tests. The
base is additionally pinned to commit
`918bf7fc05497df5ac555b1646aea6719231563c` and Git tree
`ade9b78c8e841807020c02a57ff8dd9ec4929263`.

## Verification

Acquire immutable evidence and run the aggregate gate:

```sh
CASE=recovery/cases/2.1.97-to-2.1.98
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.97/package.tgz"
```

Expected result:

```text
status          complete-recovery-verified
bundle bytes    13471101
bundle sha256   27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556
package members 20
package bytes   49087707
package sha256  850b956fe51eb41bb07b0a3fcc59b1c18cf3aa7cb06bab6961d0d290c096c8f0
source files    1933
semantic tests  9
```

For the complete construction procedure, see
[`RECOVERY_RUNBOOK.md`](./RECOVERY_RUNBOOK.md).
