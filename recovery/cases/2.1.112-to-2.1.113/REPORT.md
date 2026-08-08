# Claude Code 2.1.112 → 2.1.113 recovery report

## Result

Claude Code 2.1.113 is complete at the authenticated thin-wrapper and Linux
x64 embedded-generated-code layers.

- The exact 12,986,842-byte Bun-wrapped CLI entry reconstructs from the
  authenticated 2.1.112 `cli.js` and a Zstandard dictionary delta.
- The two other plain JavaScript entries in the authenticated Linux x64 Bun
  graph reconstruct exactly. Together, all three JavaScript entries contain
  12,991,968 bytes.
- The complete seven-member 2.1.113 wrapper package reconstructs exactly,
  including paths, types, modes, link targets, member bytes, and removals.
- The signed 236,411,520-byte Linux x64 native executable is authenticated as
  an immutable input. Its Bun section, five-entry directory, JavaScript, JSC
  cache, and two native-addon ranges are independently parsed and verified.
- All 12,986,752 UTF-16 code units in the analyzable CLI interior are covered
  by attribution, and all 4,051,255 JavaScript tokens are classified.
- A reversible 21-file source-facing overlay localizes a defensible subset of
  the 2.1.113 changes without claiming erased upstream TypeScript spelling.

The native executable is authenticated and container-verified, not rebuilt
from the 2.1.112 JavaScript package. The JSC cache and native addons are
verified binary artifacts, not additional authored JavaScript. No target
source map exists, so exact TypeScript names, types, comments, formatting, and
module boundaries remain partially unobservable. The case is therefore
labeled `generated-code-complete-linux-x64-source-partial`.

| Layer | Result |
| --- | --- |
| 2.1.113 thin wrapper package | Exact, seven members and 132,292 bytes |
| Linux x64 native executable | Authenticated and Bun-container verified |
| Embedded CLI JavaScript | Exact, 12,986,842 bytes |
| All embedded plain JavaScript | Exact, three files and 12,991,968 bytes |
| JSC cache and native addons | Exact authenticated executable ranges |
| Target generated offsets | 12,986,752 / 12,986,752 |
| Target JavaScript tokens | 4,051,255 / 4,051,255 classified |
| Incremental source overlay | Reversible, target-backed, source-facing |
| Original authored spelling | Partially unobservable |

## Adjacent-release and provenance evidence

The comparison uses the authenticated adjacent publications 2.1.112 and
2.1.113. The platform package was published immediately before the wrapper:

| Artifact | npm publication time | Git tag commit |
| --- | --- | --- |
| 2.1.112 wrapper | `2026-04-16T19:23:46.419Z` | `2b53fac3b2dd381bfb29f456f43c0b3eb9b3ebff` |
| 2.1.113 Linux x64 | `2026-04-17T19:07:25.246Z` | — |
| 2.1.113 wrapper | `2026-04-17T19:09:22.930Z` | `71366ecf5dd9103a46537eab8607a2a3c0637577` |

The public tags are in a direct parent relationship:

```text
2b53fac3b2dd381bfb29f456f43c0b3eb9b3ebff
  ↓
71366ecf5dd9103a46537eab8607a2a3c0637577
```

The target tag has tree
`dc3c978fa5469f61234496eb70e0ed820cbb2581`. Its public commit changes the
changelog, not the authored implementation, so the signed npm artifacts are
the executable authority.

The pinned official 2.1.113 changelog section contains 38 bullets and is
4,017 bytes, SHA-256
`0bbc8ace442ec0ae7682d40580e82fc9192d59e227c6b21bfa9eee6fbc818545`.
Its first bullet explicitly records the package-topology transition from
published JavaScript to a per-platform native executable.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL or archive member,
byte length, and SHA-256.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.112 wrapper tarball | 18,679,326 | `84379969ea53a0e5fd231a8f77debe4c7cb17dd971f4809d10d33f9aeca5de09` |
| 2.1.112 `cli.js` | 13,711,684 | `bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f` |
| 2.1.113 wrapper tarball | 13,614 | `6df6e9f0b174c36f8de71539099f0553ff73c49b0fcac3125f3a9447758cbbbb` |
| 2.1.113 Linux x64 tarball | 73,849,711 | `0b703a2b15e2988138b1b8d86e73228ee2aab00253ac21ffcdc828becb42d010` |
| 2.1.113 Linux x64 executable | 236,411,520 | `a81f7726b3b6b910e50c08a09f0090cb60714695d6d01bfe8698ff16cda9b87d` |
| Raw embedded CLI entry | 12,986,842 | `dda4d89e787fa455706e4f41beffc8e58d42b9094c4d155fcbf62e3f19036681` |
| Analyzable CLI interior | 12,986,752 | `4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba` |
| Unchanged declarations | 117,768 | `98730ce1055bd34558158e4d18e3bd9c75c6899f5f0f1ceff78552ce0c48766d` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 239,081 | `04540a9eb5bddaa7ab6480d8e4abbead70cec1581ba6520092ffa1637bea8f99` |

The wrapper and Linux x64 tarballs pass registry SHA-1, SHA-512 SRI, and
ECDSA P-256 signature verification under key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Package-topology recovery

The 2.1.113 wrapper is intentionally thin. Relative to 2.1.112, three members
are unchanged, `package/package.json` changes, `package/bin/claude.exe`,
`package/cli-wrapper.cjs`, and `package/install.cjs` are added, and sixteen
members are removed. The removed set includes the old `package/cli.js` and
the platform binaries formerly bundled into the universal wrapper.

Exact replay uses a 139-byte package-manifest dictionary patch and three
standalone Zstandard payloads. The resulting target has seven members,
132,292 member bytes, and framed-tree SHA-256:

```text
7333b8898ec3e7ef6a624848581b4ca22dbca42e2036b3c2519f688a74d21721
```

The separately signed Linux x64 package has four members and 236,412,106
member bytes. Its framed-tree SHA-256 is
`07611c40dd5fe9f6007f85450854a5fa9cc1315680cd074fe604fd378f8389f7`.
The wrapper installer selects this platform package and replaces the 500-byte
launcher stub with its native executable.

## Bun graph discovery and independent verification

`bun_graph` identified the executable's `.bun` graph and entry point, but its
`--extract` output rewrites `/$bunfs/root/` to the selected extraction path.
Its displayed `StringPointer` offsets also point eight bytes before the data.
The discovery output is therefore evidence, not the canonical extracted
bytes.

[`binary-extraction/inventory.json`](./binary-extraction/inventory.json)
freezes the section geometry and the correction rule:

```text
actual file offset = .bun file offset + displayed pointer offset + 8
```

The `.bun` section begins at byte 108,085,248 and spans 128,320,330 bytes,
SHA-256
`b095d0a1796ea2b1ebe5e273b84f4c626842e44fa399896b4c77ffecfdbd97d8`.
An independent parser checks the 56-byte footer, 260-byte five-record module
directory, pointer bias, names, metadata, every declared raw range, and the
entry-point normalization.

The five content entries are the CLI source, two helper JavaScript modules,
and two ELF native addons. The CLI additionally names a 113,376,768-byte JSC
cache, SHA-256
`1d2d3ec423f20d5b0998fe4ceb75ecd96db3a7882ebc7e6186610c4efc9ebf55`.
The raw CLI's fixed 87-byte Bun CommonJS prefix and three-byte suffix are
removed only for analysis. Both raw and interior forms pass `node --check`.

## Exact embedded JavaScript recovery

[`diff/cli.js.zstd-delta`](./diff/cli.js.zstd-delta) is 3,006,851 bytes,
SHA-256
`11c55b5f406469a55f42a63562a2cb6ed53283147c9c6dd191fe37927665f98a`.
Replay against the authenticated 2.1.112 `cli.js` produces the exact raw Bun
CLI entry, including its fixed wrapper.

Two standalone Zstandard payloads recover `image-processor.js` and
`audio-capture.js`. The exact three-file embedded JavaScript tree contains
12,991,968 bytes with framed-tree SHA-256:

```text
9272fcbb565dac0fd95b1d0ac3924dc8708b0173cbf4564b228d7a1225209a6a
```

No generated comparison representation is used for replay. Every recovered
file is byte-compared with its authenticated raw executable slice.

## Exhaustive generated-code accounting

The attribution inventory retains 4,756 exact 2.1.88 source-owner rows,
4,986 target initializer regions, and 30,163 exhaustive target partitions.
Only three partitions, totaling 2,181 UTF-16 code units, lack a defensible
historical owner. Their code is still present in the exact target and the
structural and readable ledgers.

The wrapper/minifier transition is much larger than the authored semantic
delta, so conservative pairing is expected:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 11,404 | 2,005,441 |
| Moved candidate | 1,617 | 22,684 |
| Coarse changed candidate | 403 | 142,629 |
| Unresolved pairing | 7,023 | 1,880,501 |
| **Total** | **20,447** | **4,051,255** |

The exact structural fraction is approximately 50.06%; the resolved fraction
is approximately 53.58%. Those values measure adjacent pairing confidence,
not recovery completeness.

The readable comparison covers 19,526 baseline and 20,447 target statements,
accepts 14,015 binding alignments and 82,266 identifier rewrites, and rejects
4,846 unsafe alignments. Its comparison invariant remains
`d7aa031c11bb709fd05e2f7b4028c4b0cde742b687521d2b0ae40f29b458b4f0`
through every accepted normalization.

## Source-facing recovery

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is a reversible 34,166-byte incremental patch, SHA-256
`a630c35001addf768a4fa679c006bcfd12c402681c686228c8b4e117c31506f8`.
It changes 21 existing source files with 338 insertions and 66 deletions.

The overlay localizes defensible owners for:

- sandbox denied-domain configuration and macOS dangerous-path handling;
- Bash comment-label spoof prevention;
- logical-line input movement, line-start deletion, and Windows backspace
  behavior;
- linewise OSC 8 URL handling;
- Remote Control extra-usage and file-suggestion requests;
- per-call MCP transport watchdogs and the ten-minute async-agent stall guard;
- MCP tool-name ranking, effort filtering and confirmation text; and
- SDK image-resize failure degradation.

The exact generated layer contains substantially more change than this
source-facing subset. Release items without a defensible owner in the
cumulative mirror remain exact in embedded code and explicitly source-partial.
Names and placement introduced by the overlay are descriptive equivalents,
not assertions of erased upstream TypeScript spelling.

## Source lineage and verification

The overlay is applied to the repository `src/` at this recovery handoff. The
source-lineage gate reverse-applies the overlay, checks the exact cumulative
2.1.112-facing base, reapplies it, byte-compares the result, syntax-builds all
21 changed paths, and runs the focused target-backed tests.

| Source tree | Files | Bytes | Framed manifest SHA-256 |
| --- | ---: | ---: | --- |
| Verified 2.1.112 base | 1,950 | 30,859,372 | `a4a78ad2e102ea43ab739cf19ab1018ed52a1c809171f73b77e7c9e973ad9195` |
| Current recovered 2.1.113-facing target | 1,950 | 30,868,405 | `f5a8fb6af53d86a047c56e5873253e330963b2c0d8b0c4517986380124c064d3` |

The verified repository base is commit
`7a202a296a5d4278f75fd0bdb3ef870e98a34452`, with `src` Git tree
`ab82ace2747fd83ae6071becad3ed20be2072ccd`.

Run the complete gate directly against the applied source tree:

```sh
CASE=recovery/cases/2.1.112-to-2.1.113
RECOVERY_ARTIFACTS=$(mktemp -d)

pixi run node recovery/scripts/acquire-case.mjs \
  --case "$CASE/manifest.json" \
  --output "$RECOVERY_ARTIFACTS"

pixi run node recovery/scripts/verify-complete-recovery.mjs \
  --case "$CASE/manifest.json" \
  --repo . \
  --artifacts "$RECOVERY_ARTIFACTS" \
  --baseline-tarball "$RECOVERY_ARTIFACTS/2.1.112/package.tgz"
```

Expected status: `complete-recovery-verified`.
