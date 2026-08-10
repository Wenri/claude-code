# Claude Code 2.1.116 → 2.1.117 recovery report

## Result

Claude Code 2.1.117 is complete at the authenticated thin-wrapper and Linux
x64 embedded-generated-code layers. It is the immediately next published
release after 2.1.116 in both npm and upstream Git.

- The exact 13,114,208-byte Bun-wrapped CLI entry reconstructs from the
  authenticated 2.1.116 embedded CLI and a deterministic Zstandard dictionary
  delta.
- The two helper JavaScript entries reconstruct exactly from their adjacent
  2.1.116 entries. All three plain-JavaScript entries contain 13,119,334 bytes.
- The complete seven-member 2.1.117 wrapper reconstructs exactly. One
  dictionary patch recovers `package.json`; the other six members, including
  `install.cjs` and `sdk-tools.d.ts`, are copied exactly.
- The signed 238,451,328-byte Linux x64 executable is authenticated as an
  immutable input. Its Bun section, five-entry directory, JavaScript, JSC
  cache, and native-addon ranges are independently parsed and verified.
- All 13,114,118 UTF-16 code units in the analyzable CLI interior are covered
  by attribution, and all 4,101,395 JavaScript tokens are classified.

The native executable is authenticated and container-verified, not rebuilt as
an ELF file from 2.1.116. The JSC cache and native addons are verified binary
ranges, not authored JavaScript. No target source map exists, so exact
TypeScript names, types, comments, formatting, and module boundaries remain
partially unobservable. The case is therefore labeled
`generated-code-complete-linux-x64-source-partial`.

| Layer | Result |
| --- | --- |
| 2.1.117 thin wrapper package | Exact, seven members and 132,486 bytes |
| Linux x64 native executable | Authenticated and Bun-container verified |
| Embedded CLI JavaScript | Exact, 13,114,208 bytes |
| All embedded plain JavaScript | Exact, three files and 13,119,334 bytes |
| JSC cache and native addons | Exact authenticated executable ranges |
| Target generated offsets | 13,114,118 / 13,114,118 |
| Target JavaScript tokens | 4,101,395 / 4,101,395 classified |
| Incremental source overlay | Reversible, target-backed, source-facing |
| Original authored spelling | Partially unobservable |

## Adjacent-release and provenance evidence

The registry sequence and direct Git ancestry both place 2.1.117 immediately
after 2.1.116:

```text
fe53778ed90fd971bf4ec78fa1f65ccf0536352f
  ↓
2fa67717b8046c253cfa55fd84002e3501f1eca6
```

| Artifact | npm publication time | Git tag commit |
| --- | --- | --- |
| 2.1.116 wrapper | `2026-04-20T19:24:52.313Z` | `fe53778ed90fd971bf4ec78fa1f65ccf0536352f` |
| 2.1.117 Linux x64 | `2026-04-21T21:52:22.049Z` | — |
| 2.1.117 wrapper | `2026-04-21T21:54:08.640Z` | `2fa67717b8046c253cfa55fd84002e3501f1eca6` |

The target tag has tree `a6593f7f3672246bffb84d54dec5ee4b9c9c4e6a`.
Its public commit changes only `CHANGELOG.md` (+31/-0), so the signed npm
artifacts remain the executable authority. The pinned 3,834-byte 2.1.117
changelog section has SHA-256
`dc78acebe5845bba1ba2d9f62581336991b7696b4ae92a96168a76fbe754490a`
and 28 bullets.

Both target tarballs pass registry SHA-1, SHA-512 SRI, and ECDSA P-256
signature verification under npm registry key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Immutable evidence

[`manifest.json`](./manifest.json) pins every input by URL or archive member,
byte length, and SHA-256. It also asserts the byte length and SHA-256 of all
25 checked generated evidence, inventory, payload, and ledger files in this
case.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.116 wrapper tarball | 13,680 | `c86bbeaf44babf744bb1e1f004a268ac31eb164ff37afa93114b766e5667f7f1` |
| 2.1.116 Linux x64 tarball | 74,153,663 | `0dde548c698cee7174751a92426123e90a95f56bf09271423681dd883d8bf0ea` |
| 2.1.116 Linux x64 executable | 237,652,608 | `0d1aea5ce056a5ce491da7e9bbe63f992585e5c24852f023a07c8f18cf292cc5` |
| 2.1.116 raw embedded CLI | 13,102,362 | `06cb80193f3af8bb468d1536b230b0e2f854a398b1e88af3c79048ce821bf193` |
| 2.1.116 analyzable CLI | 13,102,272 | `d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a` |
| 2.1.117 wrapper tarball | 13,681 | `e902abea02b1a3190d7940327267fbe53610eb4e97f365756dae6cee3f729b3a` |
| 2.1.117 Linux x64 tarball | 74,512,900 | `f01a62806aa4dd02d728463fbe3237517c8b6fe98f640e62c5dd59b48a68eaa1` |
| 2.1.117 Linux x64 executable | 238,451,328 | `b7246963d9e32ece439c3e1e7885f53773a4820e90a4d2433ef2a413a055a5fe` |
| 2.1.117 raw embedded CLI | 13,114,208 | `092d43f3fd4ef663e387038c0e3d44e0af70e17eb52b27f0805abda0fe703744` |
| 2.1.117 analyzable CLI | 13,114,118 | `518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661` |
| 2.1.117 declarations | 117,907 | `ac897b25130f69621deed0288caf88c4227677b8e122bdb5952ee46de8fb99bc` |
| 2.1.88 source-oracle bundle | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.88 source-oracle map | 59,766,257 | `7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657` |
| Pinned official changelog | 245,955 | `ba723ee5963e1816f0605d344dd326a3e999780ab796ca803344046dae877b0b` |

## Exact wrapper recovery

The adjacent wrappers have the same seven paths. Six members are
byte-identical; only `package/package.json` changes the root and optional
platform dependency versions from 2.1.116 to 2.1.117. A deterministic
dictionary patch reproduces that target member, while the other six are copied
from the authenticated baseline.

Replay produces seven files, 132,486 bytes, and framed-tree SHA-256:

```text
5989877c00805b29590a870dc429703e04d625c9830e99611bf67144e5b01dbd
```

The adjacent Linux x64 packages each have four paths. `LICENSE.md` and
`README.md` are unchanged; the executable and native package manifest change.
The target has 238,451,914 member bytes and framed-tree SHA-256
`5fa90c91572702332883d3d2667772f7112faea4edee8002ef7603a3fa0c768a`.
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

The target `.bun` section begins at byte 108,658,688 and spans 129,787,632
bytes, SHA-256
`f807907c7c5e395ff1d8bf76183c99d482eb7f498f22c2a91d638a19b1cb0333`.
The independent parser checks its 56-byte footer, 260-byte five-record module
directory, entry point, names, metadata, and every declared range. The five
content entries are the CLI, two helper JavaScript modules, and two ELF native
addons. The CLI also names a 114,716,816-byte JSC cache, SHA-256
`b0e7090810db1c77bf10c2023a4b7f27059ed8899c59d7b3a9a21b42bf1b4549`.

The graph topology and record order are unchanged from 2.1.116, but all six
content/JSC hashes change. The raw CLI's fixed 87-byte Bun CommonJS prefix and
three-byte suffix are removed only for analysis; both adjacent interiors pass
`node --check`.

## Exact embedded JavaScript recovery

The CLI dictionary delta is 2,152,169 bytes. Separate 26- and 59-byte
dictionary patches recover the image and audio helper JavaScript modules.
Together, the three target files have framed-tree SHA-256:

```text
26598d0fb6db81ebd03970649741d81b9bdae1499b325e7c502a885bb47ad447
```

No normalized or structurally paired representation is used for replay.
Every output is compared directly with its authenticated executable slice.

## Exhaustive generated-code accounting

The attribution inventory retains 4,756 exact 2.1.88 source-owner rows, 5,037
target initializer regions, and 30,034 exhaustive target partitions. Only
three partitions, totaling 2,181 UTF-16 code units, lack a defensible
historical owner. Their bytes remain present in the exact target and in both
adjacent ledgers.

The direct 2.1.116→2.1.117 structural comparison is conservative:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,652 | 3,063,651 |
| Moved candidate | 1,278 | 15,879 |
| Coarse changed candidate | 1,108 | 485,889 |
| Unresolved pairing | 1,761 | 535,976 |
| **Total** | **20,799** | **4,101,395** |

The exact structural fraction is approximately 75.08%; including supported
moved and coarse-changed pairings gives a resolved fraction of approximately
86.93%. These figures measure pairing confidence, not recovery completeness.
The readable comparison covers 20,734 baseline and 20,799 target statements,
accepts 18,602 safe binding renames, and preserves comparison-invariant hash
`73de4dfacd8528e8dd4f53af69f9932ff6a752d24be4cb7a697b30722534fe0b`.

## Source-facing recovery

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is the reversible incremental 2.1.116→2.1.117 source-facing localization.
Its focused tests use the authenticated adjacent CLI interiors rather than
assuming equivalence from changelog prose alone. The overlay is applied in the
checked-out `src/` tree; the archived patch remains the exact reversible
record of the transition.

The frozen patch is 637,321 bytes with SHA-256
`d2063694679f1a1e02d41c84bb375da029263e1feff9c1e457d66df979e21773`.
It changes 123 paths: 115 modifications, seven additions, and one deletion,
with 2,864 insertions and 856 deletions. It adds
`bridge/startupTiming.ts`, the split `commands/advisor/` command and index,
`components/LogoV2/ModelSourceNotice.tsx`,
`hooks/notifs/useAdvisorNotification.tsx`, and the MCP
`agentConfig.ts` and `headlessConnectionManager.ts` services. It replaces the
former single-file `commands/advisor.ts` implementation.

The overlay localizes authenticated adjacent behavior for advisor and agent
MCP lifecycle/UI, remote review and ultrareview, OAuth retry/login, WebFetch
truncation, input undo, proxy bypass, OTel effort and command telemetry,
remote control and attach, routines, model deprecation, terminal parsing,
autocompact core, command capabilities, and scheduled-task ownership. It also
captures adjacent filesystem, Git, shell, installer, plugin, and network
hardening, including the byte watchdog, traversal-after-symlink denial, safe
symlink copying, option/path validation, atomic native installation, and
multi-positional `cd` denial.

The 44 exact generated-fragment assertions preserve baseline and target
occurrence counts, fragment hashes, and classifications. They comprise 37
adjacent target-only fragments, two adjacent removals, two inherited
source-localization gaps, and one each of generated-only, inherited-generated,
and inherited-observation evidence. Forty-three fragments remain present in
the target; the target-removed `/autocompact` fragment is checked by the
focused tests. The `/files` initializer removal is also authenticated while
its authored module remains as unreachable source.

The boundary catalog deliberately does not invent authored locations for
generated-only background-job-agent and context-hint-controller modules, the
external VSCode ManagePlugins component, or the unsupported stale-resume
summary claim. It records the fork module as inherited and preserves explicit
source-mirror gaps for the generated `powerup`, `team-onboarding`,
`toggle-memory`, `recap`, `mode`, and `stop-hook` command modules.

Some source hunks localize prerequisites already present in both generated
bundles, including the SDK OAuth refresh protocol and canonical model
normalization. They are labeled inherited source gaps, not newly introduced
2.1.117 behavior. The overlay is intentionally source-partial: it localizes a
defensible subset of target-backed behavior, but no target source map exposes
exact authored TypeScript spelling or original module boundaries. The exact
recovery claim belongs to the reconstructed generated JavaScript graph and
wrapper tree.

## Source lineage and verification

The verified source base is commit
`e08046f528857203cbdede147bcab8b8b8021bf7`, whose `src` Git tree is
`6f4e63ccc6cf7a3ff146f1b2d46b94136f0b00cf`.

The base summary is 1,951 files, 30,923,332 bytes, and framed SHA-256
`b1a90b5f154db24f709ab12afb2bc746ddc1e03ea07235d4880f099743ec58a4`.
Applying the frozen patch produces 1,957 files, 30,993,723 bytes, and framed
SHA-256
`135719f7be0cccc9e4658e0f7b78d46e52d947cc171a9bf80b36e1081d727cee`.
All 122 target-existing changed TypeScript/TSX paths pass Bun syntax
construction. The generated-fragment, recovery-boundary, and source-overlay
test files pass 8/8 from both the base and applied-target orientations.

The case is handed off with `src/` at the exact 2.1.117-facing target summary.
The runbook runs the complete gate directly against this applied state. For a
clean-room replay it documents applying the incremental patch to the verified
2.1.116 base; for a manual reversibility audit it reverses only this case's
overlay and immediately reapplies it before exit. The lineage verifier performs
the same reverse/reapply check in a disposable workspace, syntax-builds every
declared target-existing changed source path, and runs target-backed focused
tests. Both the independent semantic audit and the mechanical source-lineage
audit approved the frozen overlay, and the complete applied-target recovery
gate passed.

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
2.1.116 → 2.1.117. The source-facing patch has the same orientation. Apply it
only to the verified 2.1.116 source base. The checked-out source tree already
carries the target, so do not apply it twice. Reverse only this case's overlay
for a deliberate audit, and reapply it before handing the repository off.
