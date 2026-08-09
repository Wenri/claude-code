# Claude Code 2.1.114 → 2.1.116 recovery report

## Result

Claude Code 2.1.116 is complete at the authenticated thin-wrapper and Linux
x64 embedded-generated-code layers. Version 2.1.115 was not published by npm
and has no upstream Git tag, so 2.1.116 is the adjacent release after 2.1.114.

- The exact 13,102,362-byte Bun-wrapped CLI entry reconstructs from the
  authenticated 2.1.114 embedded CLI and a deterministic Zstandard dictionary
  delta.
- The two helper JavaScript entries reconstruct exactly from their adjacent
  2.1.114 entries. All three plain-JavaScript entries contain 13,107,488 bytes.
- The complete seven-member 2.1.116 wrapper reconstructs exactly. Three
  dictionary patches recover `install.cjs`, `package.json`, and
  `sdk-tools.d.ts`; the other four members are copied exactly.
- The signed 237,652,608-byte Linux x64 executable is authenticated as an
  immutable input. Its Bun section, five-entry directory, JavaScript, JSC
  cache, and native-addon ranges are independently parsed and verified.
- All 13,102,272 UTF-16 code units in the analyzable CLI interior are covered
  by attribution, and all 4,093,279 JavaScript tokens are classified.
- The declaration change is proved as one exact 139-byte insertion adding the
  optional `ghRateLimitHint` field to `BashOutput`.

The native executable is authenticated and container-verified, not rebuilt as
an ELF file from 2.1.114. The JSC cache and native addons are verified binary
ranges, not authored JavaScript. No target source map exists, so exact
TypeScript names, types, comments, formatting, and module boundaries remain
partially unobservable. The case is therefore labeled
`generated-code-complete-linux-x64-source-partial`.

| Layer | Result |
| --- | --- |
| 2.1.116 thin wrapper package | Exact, seven members and 132,486 bytes |
| Linux x64 native executable | Authenticated and Bun-container verified |
| Embedded CLI JavaScript | Exact, 13,102,362 bytes |
| All embedded plain JavaScript | Exact, three files and 13,107,488 bytes |
| JSC cache and native addons | Exact authenticated executable ranges |
| Target generated offsets | 13,102,272 / 13,102,272 |
| Target JavaScript tokens | 4,093,279 / 4,093,279 classified |
| Incremental source overlay | Reversible, target-backed, source-facing |
| Original authored spelling | Partially unobservable |

## Adjacent-release and provenance evidence

The registry sequence jumps directly from 2.1.114 to 2.1.116. Exact npm
metadata confirms that 2.1.115 is absent for the wrapper, and the upstream Git
repository has no `v2.1.115` tag. The public tags are a direct parent pair:

```text
0385848b4e737831fc3b973d9a78d31950a87d9d
  ↓
fe53778ed90fd971bf4ec78fa1f65ccf0536352f
```

| Artifact | npm publication time | Git tag commit |
| --- | --- | --- |
| 2.1.114 wrapper | `2026-04-17T23:26:20.555Z` | `0385848b4e737831fc3b973d9a78d31950a87d9d` |
| 2.1.116 Linux x64 | `2026-04-20T19:22:57.666Z` | — |
| 2.1.116 wrapper | `2026-04-20T19:24:52.313Z` | `fe53778ed90fd971bf4ec78fa1f65ccf0536352f` |

The target tag has tree `4708245c1a69a70166aae3b53da3f3ab7ee52536`.
Its public commit changes only `CHANGELOG.md` (+27/-0), so the signed npm
artifacts remain the executable authority. The pinned 2,931-byte 2.1.116
changelog section has SHA-256
`f4159b05140593eb4f095d2527be3e4a5eb78f203718052252ff73912fb6b1aa`
and 24 bullets.

Both target tarballs pass registry SHA-1, SHA-512 SRI, and ECDSA P-256
signature verification under npm registry key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL or archive member,
byte length, and SHA-256. It also asserts the byte length and SHA-256 of all
27 checked generated evidence, inventory, payload, and ledger files in this
case.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.114 wrapper tarball | 13,614 | `2092a5ac6ae7115f46b961662d5dc872038219f37cf91ee57b7004614b87b9af` |
| 2.1.114 Linux x64 tarball | 73,850,665 | `c1123db5ac5003185686866f7431cc9c831e92c286bba2104382ca4403230195` |
| 2.1.114 Linux x64 executable | 236,411,520 | `12bd4b0916deb06be17ffc7b2f0485e140bf00b2db3dcb78469d66723d73c27f` |
| 2.1.114 raw embedded CLI | 12,986,845 | `5db5e2191a2ea9d74713e0881fa689ab244a2c1c4a58986840fb7b02cd162c83` |
| 2.1.114 analyzable CLI | 12,986,755 | `cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16` |
| 2.1.116 wrapper tarball | 13,680 | `c86bbeaf44babf744bb1e1f004a268ac31eb164ff37afa93114b766e5667f7f1` |
| 2.1.116 Linux x64 tarball | 74,153,663 | `0dde548c698cee7174751a92426123e90a95f56bf09271423681dd883d8bf0ea` |
| 2.1.116 Linux x64 executable | 237,652,608 | `0d1aea5ce056a5ce491da7e9bbe63f992585e5c24852f023a07c8f18cf292cc5` |
| 2.1.116 raw embedded CLI | 13,102,362 | `06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193` |
| 2.1.116 analyzable CLI | 13,102,272 | `d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a` |
| 2.1.116 declarations | 117,907 | `ac897b25130f69621deed0288caf88c4227677b8e122bdb5952ee46de8fb99bc` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 242,121 | `5b72ee8862d1964719b9d6358ee497e351640376fa850320ce5167aa7f00c891` |

## Exact wrapper recovery

The adjacent wrappers have the same seven paths. Four members are
byte-identical and three change:

| Member | Change |
| --- | --- |
| `package/install.cjs` | Exact 55-byte brace/comment expansion |
| `package/package.json` | Root and eight optional-dependency versions become 2.1.116 |
| `package/sdk-tools.d.ts` | Exact `ghRateLimitHint?: string` documentation/property insertion |

Deterministic dictionary patches reproduce all three target members. The
other four are copied from the authenticated baseline. Replay produces seven
files, 132,486 bytes, and framed-tree SHA-256:

```text
5cf546a554e481b32f4633be6f883c8740b05f34a359142e9665a591011e90c0
```

The declaration assertion is stronger than merely observing a changed hash:
applying one exact insertion after the unique
`staleReadFileStateHint?: string;` anchor reproduces all 117,907 target bytes.

The adjacent Linux x64 packages each have four paths. `LICENSE.md` and
`README.md` are unchanged; the executable and native package manifest change.
The target has 237,653,194 member bytes and framed-tree SHA-256
`82c0a00eea042ff53e6071400a401e375ae2df4904cce9ff914f7978af75d206`.
This inventory proves package topology and exact bytes but does not claim the
ELF is reconstructed from JavaScript source.

## Bun graph discovery and independent verification

`bun_graph` identified the target executable's `.bun` graph. Its extraction
rewrites `/$bunfs/root/` to the selected output path, and its displayed
`StringPointer` values point eight bytes before their data. Discovery output
is therefore evidence, while manifest-declared direct byte slices are
canonical.

[`binary-extraction/inventory.json`](./binary-extraction/inventory.json)
freezes the correction rule:

```text
actual file offset = .bun file offset + displayed pointer offset + 8
```

The target `.bun` section begins at byte 108,085,248 and spans 129,564,426
bytes, SHA-256
`1e3df6cda488cc24b9fad09354d1d18fca960af3e41869005eb8727bf3be061a`.
The independent parser checks its 56-byte footer, 260-byte five-record module
directory, entry point, names, metadata, and every declared range. The five
content entries are the CLI, two helper JavaScript modules, and two ELF native
addons. The CLI also names a 114,505,344-byte JSC cache, SHA-256
`6a2ef89e26373afa29462f6edc4eb41bd516b95be89cd9c872efe3d8cc2c7ec3`.

The graph topology and record order are unchanged from 2.1.114. Both native
addons are byte-identical. The raw CLI's fixed 87-byte Bun CommonJS prefix and
three-byte suffix are removed only for analysis; both adjacent interiors pass
`node --check`.

## Exact embedded JavaScript recovery

The CLI dictionary delta is 2,368,314 bytes. The larger payload reflects a
substantial generated release, not uncertainty: replay still byte-compares
exactly with the authenticated executable slice. Two 26-byte dictionary
patches recover the helper JavaScript modules. Together, the three target
files have framed-tree SHA-256:

```text
e0f43f765bb8cf903dfda2bdfe0feb7549d5a4b9b4202de61c4bd9b21df97190
```

No normalized or structurally paired representation is used for replay.
Every output is compared directly with its authenticated executable slice.

## Exhaustive generated-code accounting

The attribution inventory retains 4,756 exact 2.1.88 source-owner rows, 5,031
target initializer regions, and 30,079 exhaustive target partitions. Only
three partitions, totaling 2,181 UTF-16 code units, lack a defensible
historical owner. Their bytes remain present in the exact target and in both
adjacent ledgers.

The direct 2.1.114→2.1.116 structural comparison is conservative:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,864 | 3,308,657 |
| Moved candidate | 1,504 | 15,025 |
| Coarse changed candidate | 392 | 123,224 |
| Unresolved pairing | 1,974 | 646,373 |
| **Total** | **20,734** | **4,093,279** |

The exact structural fraction is approximately 81.20%; including supported
moved and coarse-changed pairings gives a resolved fraction of approximately
84.21%. These figures measure pairing confidence, not recovery completeness.
The readable comparison covers 20,447 baseline and 20,734 target statements,
accepts 18,787 safe binding renames, and preserves comparison-invariant hash
`20753ff833bf02449cb20e00f4c0ad8c688bfbd5746cd6e78faac8ff4987ba61`.

## Source-facing recovery

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is the reversible incremental 2.1.114→2.1.116 source-facing localization.
Its focused tests use the authenticated adjacent CLI interiors rather than
assuming equivalence from changelog prose alone.
The overlay is applied in the checked-out `src/` tree; the archived patch
remains the exact reversible record of the source-facing transition.

The frozen patch is 962,068 bytes with SHA-256
`01487cd46ad03070321671860afdfacc445c3de21f7bef50f56d1e221c7405b1`.
It changes 56 paths: 53 modifications, two additions, and one deletion, with
2,411 insertions and 683 deletions. It adds
`components/Settings/UsageContributors.tsx` and
`utils/plugins/missingDependencyResolver.ts`, and removes
`components/ThinkingIndicator.tsx`.

The 34 exact generated-fragment assertions separate adjacent evidence from
inherited localization. Target-only anchors cover deferred MCP templates,
configuration enum matching, the GitHub rate-limit hint, Usage fallback,
main-thread agent hooks, command filtering, dangerous-path classification,
keyboard/suspend/terminal/Ink behavior, plugin dependency resolution,
relaunch, doctor, thinking milestones, modal sizing, branch streaming,
resume handling, and large-session scanning. Within that set, equal-count
evidence is labeled inherited for the Usage-contributors UI, categorized
Installed-plugin rows and pagination, the resume-error string, and scanner
boundary vocabulary. Source review separately classifies active-task update
refusal and relaunch argument overrides as inherited localization rather than
adjacent code. The already-localized xterm adaptive drain/color profile,
dead-fork prefilter, and orphan wide-cell cleanup remain unchanged by this
patch.

The source patch can contain both target-only adjacent behavior and inherited
source-localization gaps: behavior present in both generated bundles may still
be missing from the cumulative source mirror. The generated-fragment test
records baseline and target occurrence counts and labels equal-count evidence
as inherited; neither a changelog bullet nor a source patch hunk is treated as
proof that code was newly introduced in this adjacent release.

The overlay is intentionally source-partial. It localizes a defensible subset
of target-backed behavior into the cumulative source mirror, but no target
source map exposes exact authored TypeScript spelling or original module
boundaries. The exact recovery claim belongs to the reconstructed generated
JavaScript graph and wrapper tree.

## Source lineage and verification

The verified source base is commit
`f7d9656548fd1e7849a9e243d9950dbb7307690c`, whose `src` Git tree is
`fd5c4c4e04b12590984af6eeeb9ce2ecec157c2f`.

The base summary is 1,950 files, 30,868,629 bytes, and framed SHA-256
`45d994bcaea6ce0c204722a7cfc6c9973296d8f0a64cbfa96f935fda24f5e3e0`.
Applying the frozen patch produces 1,951 files, 30,923,332 bytes, and framed
SHA-256
`b1a90b5f154db24f709ab12afb2bc746ddc1e03ea07235d4880f099743ec58a4`.
All 55 target-existing changed TypeScript/TSX paths pass syntax construction.
The generated-fragment, source-overlay, and inherited-regression suites pass
15/15 from both the base and applied-target orientations.

The case is handed off with `src/` at that exact 2.1.116-facing target summary.
The runbook runs the full gate against this applied state. For a clean-room
replay it also documents applying the incremental patch to the verified
2.1.114 base, and for a manual reversibility audit it reverses only this case's
overlay before restoring the 2.1.116 target. The lineage verifier performs the
same reverse/reapply check in a disposable workspace, syntax-builds the changed
source paths, and runs the target-backed focused tests.

Run the complete procedure in [`RECOVERY_RUNBOOK.md`](./RECOVERY_RUNBOOK.md).
The complete gate requires these nine statuses:

```text
evidence-verified
bun-container-verified
source-lineage-verified
exact-delta-verified
attribution-report-verified
structural-ledger-verified
readable-diff-verified
embedded-code-reconstructed
exact-package-tree-reconstructed
```

## Diff orientation

Every checked-in recovery payload and ledger is oriented
2.1.114 → 2.1.116. The source-facing patch has the same orientation. Apply it
only to the verified 2.1.114 source base; reverse it only from the verified
2.1.116-facing target state.
