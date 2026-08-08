# Claude Code 2.1.113 → 2.1.114 recovery report

## Result

Claude Code 2.1.114 is complete at the authenticated thin-wrapper and Linux
x64 embedded-generated-code layers.

- The exact 12,986,845-byte Bun-wrapped CLI entry reconstructs from the
  authenticated 2.1.113 embedded CLI and a deterministic Zstandard dictionary
  delta.
- The two helper JavaScript entries reconstruct exactly from their adjacent
  2.1.113 entries. Together, all three plain JavaScript entries contain
  12,991,971 bytes.
- The complete seven-member 2.1.114 wrapper package reconstructs exactly; only
  `package/package.json` changes.
- The signed 236,411,520-byte Linux x64 native executable is authenticated as
  an immutable input. Its Bun section, five-entry directory, JavaScript, JSC
  cache, and native-addon ranges are independently parsed and verified.
- All 12,986,755 UTF-16 code units in the analyzable CLI interior are covered
  by attribution, and all 4,051,256 JavaScript tokens are classified.
- A reversible one-file source-facing overlay localizes the permission-dialog
  crash fix, is backed by the exact adjacent bundles and a focused test, and
  is applied to the current source mirror.

The native executable is authenticated and container-verified, not rebuilt as
an ELF file from 2.1.113. The JSC cache and native addons are verified binary
ranges, not authored JavaScript. No target source map exists, so exact
TypeScript names, types, comments, formatting, and module boundaries remain
partially unobservable. The case is therefore labeled
`generated-code-complete-linux-x64-source-partial`.

| Layer | Result |
| --- | --- |
| 2.1.114 thin wrapper package | Exact, seven members and 132,292 bytes |
| Linux x64 native executable | Authenticated and Bun-container verified |
| Embedded CLI JavaScript | Exact, 12,986,845 bytes |
| All embedded plain JavaScript | Exact, three files and 12,991,971 bytes |
| JSC cache and native addons | Exact authenticated executable ranges |
| Target generated offsets | 12,986,755 / 12,986,755 |
| Target JavaScript tokens | 4,051,256 / 4,051,256 classified |
| Incremental source overlay | Applied, reversible, target-backed, source-facing |
| Original authored spelling | Partially unobservable |

## Adjacent-release and provenance evidence

The comparison uses the authenticated adjacent publications 2.1.113 and
2.1.114. The target platform package was published immediately before its
wrapper:

| Artifact | npm publication time | Git tag commit |
| --- | --- | --- |
| 2.1.113 wrapper | `2026-04-17T19:09:22.930Z` | `71366ecf5dd9103a46537eab8607a2a3c0637577` |
| 2.1.114 Linux x64 | `2026-04-17T23:24:28.107Z` | — |
| 2.1.114 wrapper | `2026-04-17T23:26:20.555Z` | `0385848b4e737831fc3b973d9a78d31950a87d9d` |

The public tags are a direct parent pair:

```text
71366ecf5dd9103a46537eab8607a2a3c0637577
  ↓
0385848b4e737831fc3b973d9a78d31950a87d9d
```

The target tag has tree `330d0d87da792c88da71599c5be1dcef31a5bd9e`.
Its public commit changes only `CHANGELOG.md` (+4/-0), so the signed npm
artifacts remain the executable authority. The pinned 109-byte 2.1.114
changelog section has SHA-256
`149a9d71224c7260b2914c7638c469b75bcc0921426f5a6260a9e82a6713d6ad`
and one bullet: the permission dialog no longer crashes when an agent-teams
teammate requests tool permission.

Both target tarballs pass registry SHA-1, SHA-512 SRI, and ECDSA P-256
signature verification under npm registry key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL or archive member,
byte length, and SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.113 wrapper tarball | 13,614 | `6df6e9f0b174c36f8de71539099f0553ff73c49b0fcac3125f3a9447758cbbbb` |
| 2.1.113 Linux x64 tarball | 73,849,711 | `0b703a2b15e2988138b1b8d86e73228ee2aab00253ac21ffcdc828becb42d010` |
| 2.1.113 Linux x64 executable | 236,411,520 | `a81f7726b3b6b910e50c08a09f0090cb60714695d6d01bfe8698ff16cda9b87d` |
| 2.1.113 raw embedded CLI | 12,986,842 | `dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681` |
| 2.1.113 analyzable CLI | 12,986,752 | `4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba` |
| 2.1.114 wrapper tarball | 13,614 | `2092a5ac6ae7115f46b961662d5dc872038219f37cf91ee57b7004614b87b9af` |
| 2.1.114 Linux x64 tarball | 73,850,665 | `c1123db5ac5003185686866f7431cc9c831e92c286bba2104382ca4403230195` |
| 2.1.114 Linux x64 executable | 236,411,520 | `12bd4b0916deb06be17ffc7b2f0485e140bf00b2db3dcb78469d66723d73c27f` |
| 2.1.114 raw embedded CLI | 12,986,845 | `5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83` |
| 2.1.114 analyzable CLI | 12,986,755 | `cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16` |
| Unchanged declarations | 117,768 | `98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 239,190 | `5cbbc5f54ae136afb6877495f6a593bce64bda1c3353b88bb6819a8f6e1b5201` |

## Package recovery

The adjacent wrappers have the same seven paths and 132,292 member bytes. Six
members are byte-identical. `package/package.json` changes the root version and
the eight optional platform dependency versions from 2.1.113 to 2.1.114. A
single dictionary patch recovers the exact target manifest; unchanged members
are copied from the authenticated baseline. The target framed-tree SHA-256 is:

```text
39c4b7cbbdcb93f859ae5d869c0d787bb79a82ede36148f1d6da064b8d675a2d
```

The adjacent Linux x64 packages each have four members and 236,412,106 member
bytes. `LICENSE.md` and `README.md` are unchanged; the executable and package
manifest change. The target framed-tree SHA-256 is
`1523f540e0ed8d67a0cac4324c1d3b9e9cca5567b9600aceae621852bb71cfc8`.
The package remains an authenticated native container rather than a claim that
the ELF can be reproduced from JavaScript source.

## Bun graph discovery and independent verification

`bun_graph` identified the target executable's `.bun` graph. Its extraction
rewrites `/$bunfs/root/` to the selected output path, and its displayed
`StringPointer` values point eight bytes before their data. Discovery output is
therefore evidence, while manifest-declared direct byte slices are canonical.

[`binary-extraction/inventory.json`](./binary-extraction/inventory.json)
freezes the correction rule:

```text
actual file offset = .bun file offset + displayed pointer offset + 8
```

The target `.bun` section begins at byte 108,085,248 and spans 128,320,349
bytes, SHA-256
`444a78135ad300ca95ad06a89cfdfba09f089a1c95adb421fd7a8f13aa89eb71`.
The independent parser checks its 56-byte footer, 260-byte five-record module
directory, entry point, names, metadata, and every declared range. The five
content entries are the CLI, two helper JavaScript modules, and two ELF native
addons. The CLI also names a 113,376,784-byte JSC cache, SHA-256
`22a82cd32f6af1594c0c7c91f8981712dc30219b556c334559b97eff05f499ee`.

The raw CLI's fixed 87-byte Bun CommonJS prefix and three-byte suffix are
removed only for analysis. Both adjacent interiors pass `node --check`.

## Exact embedded JavaScript recovery

The CLI dictionary delta is only 3,574 bytes because the adjacent generated
graphs are nearly identical. Dictionary patches also recover the two helper
JavaScript modules. Replay produces the exact three-file target graph with
framed-tree SHA-256:

```text
d2b3dcfaa0d29fc54e22bfebb77f307d5fc357058258a92dc84c3585799a983f
```

No normalized or structurally paired representation is used for replay.
Every output is byte-compared with its authenticated executable slice.

## Exhaustive generated-code accounting

The attribution inventory retains 4,756 exact 2.1.88 source-owner rows, 4,986
target initializer regions, and 30,163 exhaustive target partitions. Only
three partitions, totaling 2,181 UTF-16 code units, lack a defensible
historical owner. Their bytes remain present in the exact target and in both
adjacent ledgers.

The direct 2.1.113→2.1.114 structural comparison is conservative:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 20,375 | 3,978,276 |
| Moved candidate | 0 | 0 |
| Coarse changed candidate | 0 | 0 |
| Unresolved pairing | 72 | 72,980 |
| **Total** | **20,447** | **4,051,256** |

Both exact and resolved structural fractions are approximately 98.20%. Those
figures measure pairing confidence, not recovery completeness. The readable
comparison covers 20,447 statements on each side, accepts 26,726 already-equal
binding alignments, makes no speculative identifier rewrites, and rejects 224
unsafe alignments. Its invariant hash remains
`3f8737356e768e5e7f53b63b0d36f4f2665a635b9c7c2fac2d4c5293c7bf172a`.

## Source-facing recovery

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is a reversible 1,061-byte one-file overlay, SHA-256
`99fe15ef8fc7bcb9e1db0f899b4923e0a0b73c8267287ce3f3edb619dfc2f841`.
It changes
`src/components/permissions/hooks.ts` so permission-request logging reads the
optional app-state accessor safely:

```text
.toolUseContext.getAppState().toolPermissionContext.mode
  →
.toolUseContext.getAppState?.()?.toolPermissionContext.mode
```

After normalizing the 133 version literals and 132 build-time literals, the
authenticated adjacent CLI interiors share 11,447,300 prefix characters and
1,539,450 suffix characters. The only remaining generated change is `()` to
`?.()?`, a three-character insertion. The focused test exercises both the
missing-accessor and ordinary permission-mode paths and proves this exact
generated transition.

The cumulative source mirror did not yet contain the baseline bundle's
existing `permissionMode` telemetry localization. Consequently, part of the
one-file patch closes that inherited source-facing gap, while the optional
chain is the actual adjacent release change. The overlay does not claim every
hunk is newly authored in 2.1.114, nor does it assert erased upstream
TypeScript spelling. Exactness belongs to the reconstructed generated graph.

## Source lineage and verification

The verified source base is commit
`d88405d4b4b7ce6e066e1d67e7fc421b54d685f0`, whose `src` Git tree is
`6dd7753b4db4bba78438b64ca850f1cc1802b430`.

| Source tree | Files | Bytes | Framed manifest SHA-256 |
| --- | ---: | ---: | --- |
| Verified 2.1.113 base | 1,950 | 30,868,405 | `f5a8fb6af53d86a047c56e5873253e330963b2c0d8b0c4517986380124c064d3` |
| Applied 2.1.114-facing target | 1,950 | 30,868,629 | `45d994bcaea6ce0c204722a7cfc6c9973296d8f0a64cbfa96f935fda24f5e3e0` |

Run the full gate against the current applied source tree:

```sh
CASE=recovery/cases/2.1.113-to-2.1.114
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.113/package.tgz" \
  --repo .
```

The gate authenticates artifacts and slices, reparses the Bun container,
rebuilds the exact CLI/helpers and wrapper package, checks exhaustive
attribution and structural/readable ledgers, reverse/reapplies the overlay,
syntax-builds its source path, and runs the target-backed test.

The repository `src/` now remains on the applied 2.1.114-facing target. The
checked-in patch preserves the exact 2.1.113-to-2.1.114 source-overlay
orientation and provides the reversible record used by the lineage verifier.

## Diff orientation

The checked-in recovery payloads and readable ledgers are oriented
2.1.113 → 2.1.114. The source-facing patch has the same orientation. Use
`git apply --reverse` only to return an applied 2.1.114 source tree to its
2.1.113 base.
