# Claude Code 2.1.118 → 2.1.119 recovery report

## Result

Claude Code 2.1.119 has been recovered at the authenticated npm-wrapper,
Linux x64 embedded-code, structural, semantic, and source-facing layers. It is
the next published npm release after 2.1.118; no registry version is skipped.

- The authenticated Linux executable contains an exact 13,721,077-byte Bun
  CLI entry. Removing its fixed 87-byte wrapper prefix and three-byte suffix
  yields the 13,720,987-byte analyzable CLI with SHA-256
  `9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef`.
- Deterministic Zstandard dictionary payloads reproduce the CLI entry, image
  helper, audio helper, and wrapper `package.json` byte-for-byte from 2.1.118.
  `sdk-tools.d.ts` is unchanged.
- The complete seven-member wrapper has 132,031 bytes: six members are reused
  exactly and one is reconstructed. The embedded plain-JavaScript graph has
  three files and 13,726,203 bytes.
- The signed 245,230,208-byte Linux executable is authenticated as an input.
  Its 136,532,357-byte Bun section, five-record directory, JSC cache, helper
  JavaScript, and native-addon ranges are independently parsed and verified.
- Exhaustive generated-offset accounting covers all 13,720,987 UTF-16 code
  units in 58,513 ordered target ranges, with zero gaps or overlap.
- The structural ledger classifies all 4,312,550 JavaScript tokens and all
  21,893 top-level units.
- The semantic catalog contains 135 obligations: 51 official changelog
  bullets, 65 hidden or inherited application obligations, and 19 daemon,
  Fleet, and query obligations. Eight focused suites authenticate 278 target
  fragments, one target absence, 290 source assertions, and two source
  absences, and pass 86/86 tests.
- The frozen source-facing overlay changes 290 paths—66 additions and 224
  modifications—with 25,828 insertions and 1,994 deletions. It produces the
  exact 2,088-file target source tree.
- All 278 changed or added TypeScript/TSX entries build with Bun. The runtime
  import audit scans 2,041 code files and introduces zero unresolved imports.
  The retained 2.1.118 suites also pass 21/21.

The executable is authenticated and container-verified, not rebuilt as an ELF
file. The JSC cache and native addons are authenticated binary ranges, not
authored JavaScript. No 2.1.119 source map is published, so original TypeScript
names, types, comments, formatting, and module boundaries remain partly
unobservable. The case therefore remains
`generated-code-complete-linux-x64-source-partial`: generated behavior is
complete, while the source tree is a verified semantic localization rather
than a claim about unavailable original spelling.

| Layer | Result |
| --- | --- |
| 2.1.119 wrapper | Exact, seven members and 132,031 bytes |
| Linux x64 executable | Authenticated and Bun-container verified |
| Embedded CLI JavaScript | Exact, 13,721,077 bytes |
| Analyzable CLI interior | Exact, 13,720,987 bytes |
| All embedded plain JavaScript | Exact, three files and 13,726,203 bytes |
| Generated offset accounting | 13,720,987 / 13,720,987 UTF-16 units |
| Structural accounting | 4,312,550 / 4,312,550 tokens |
| Semantic correspondence | 135 / 135 obligations; 571 evidence records |
| Source overlay | Frozen, reversible, 290 paths; applied target |

## Adjacent release and provenance

The npm registry sequence for both the wrapper and Linux x64 package is
2.1.116, 2.1.117, 2.1.118, 2.1.119, 2.1.120, 2.1.121, 2.1.122. The Linux x64
2.1.119 package was published at `2026-04-23T21:34:42.209Z`; the wrapper
followed at `2026-04-23T21:36:46.450Z`.

The public tag is commit
`ab3ce06c9ac0a6a0405850e642b80b0bb2c9fb25`, with parent
`a5fa36cac70f849daa48a0fc1aaa52af5d1c83b4`. The chain from v2.1.118 has two
commits. Its public diff changes `.claude-plugin/marketplace.json` and
`CHANGELOG.md` (+55/-1); it is not changelog-only. The pinned 5,230-byte
2.1.119 changelog section has SHA-256
`e405e0f28fb99cbcf35c7ad6381d6b2e1fd204870400ec5d349b8a069f205eb9`
and contains 51 bullets.

Both target tarballs pass registry SHA-1, SHA-512 SRI, and npm ECDSA signature
verification. Exact registry, signature, public-key, timestamp, tag, tree, and
changelog identities are frozen in
[`evidence/provenance.json`](./evidence/provenance.json).

## Immutable target evidence

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.119 wrapper tarball | 13,541 | `70213032ec5bede0b88a78d9bc4fa3619d81e507a3ffe4dd0bebb15b15f335f2` |
| 2.1.119 Linux x64 tarball | 76,696,630 | `2a97954a862fc1dc096601f011eb46adeea0d95d08ac98fcd272ca1681ae9ca8` |
| 2.1.119 Linux x64 executable | 245,230,208 | `cca43053f062949495596b11b6fd1b59cf79102adb13bacbe66997e6fae41e4a` |
| Raw embedded CLI | 13,721,077 | `bc814388b51cbcb5114db927e60f8fbb5e12409532a89137429975556c29464e` |
| Analyzable CLI | 13,720,987 | `9a1fccbe69ffe06c82345db1cc8cdbbc9a9929ed723bc8832ad48dfeff64b4ef` |
| JSC cache | 120,854,672 | `8582ccaaf502507cd2639aba35cdf917d3bc07becb87921c0e54320bcf8dfa68` |
| Wrapper declarations | 117,452 | `8f907e0e9fd160b857d25881375f73f1bddd3642d372ad52ea71d7ff441f3ddf` |
| Pinned full changelog | 255,309 | `88d929d9b71befc31ce318a9425d721b671ff5d8ca23cc4d0275f8e7244bb88a` |

## Exact package and embedded-code recovery

[`package-members.json`](./package-members.json) proves that the wrapper has
the same seven paths as 2.1.118: six unchanged and one changed, with no
addition, removal, or mode-only change. Only `package/package.json` changes;
the SDK declaration, installer, wrapper, README, license, and Windows launcher
are byte-identical.

The four deterministic payloads under [`diff/`](./diff/) contain 2,355,758
bytes. They reproduce the raw CLI, both helper JavaScript modules, and wrapper
manifest exactly. The helper changes are version comments only; both native
addons are byte-identical to 2.1.118.

[`binary-extraction/inventory.json`](./binary-extraction/inventory.json)
freezes direct Bun slices. The target `.bun` section starts at executable
offset 108,691,456 and contains five records: CLI JavaScript plus JSC, two
helper JavaScript entries, and two ELF addons. The displayed Bun pointers have
an eight-byte bias, which the independent parser and `bun_graph` output agree
on. Direct slicing is canonical because discovery extraction rewrites Bun
virtual paths.

## Generated-code accounting

The attribution inventory interleaves 29,256 exact anchors with 29,257
partitions into 58,513 ordered target ranges. Their combined UTF-16 length is
exactly 13,720,987. Three conservative unresolved ownership partitions span
2,181 units; their bytes remain present in the exact target and every generated
ledger. This is an ownership-confidence boundary, not missing code.

The structural classification is:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,754 | 3,499,586 |
| Moved structural match | 2,035 | 36,691 |
| Coarse changed candidate | 732 | 215,646 |
| Unresolved pairing | 2,372 | 560,627 |
| **Total** | **21,893** | **4,312,550** |

The exact structural fraction is about 82.00%; including supported moved and
coarse-changed pairings accounts for about 87.00% of target tokens. The
readable comparison is a review layer. Exact replay always uses raw
dictionary payloads.

## Semantic and source-facing recovery

[`semantic/obligations.json`](./semantic/obligations.json) is generated
losslessly from three reviewed inputs:

- 51 official changelog rows, each covered exactly once;
- 65 hidden, adjacent, inherited, inert, and authenticated-noise obligations;
- 19 daemon, Fleet, query, classifier, recap, and stop-hook obligations.

[`semantic/adjacent-direct-evidence.json`](./semantic/adjacent-direct-evidence.json)
binds all 84 non-official rows one-for-one to exact bundle counts and exact
source counts or absences. Its dedicated executable suite rejects missing,
duplicate, reordered, or unrelated row evidence.

The eight hash-pinned focused suites consume all 278 target fragments, one
target absence, 290 source assertions, and two source absences. No test file
or evidence record is left unbound. Late audit findings—among
them `/background` and background-only `/stop`, Ultraplan dialogs and handoff,
wake routing, background MCP approval state, exact away-summary behavior,
plugin monitors and hardening, platform telemetry, and bridge persistence—are
explicit catalog entries rather than informal notes.

The macOS voice-dictation bullet is outside the authenticated Linux native
delta. Its catalog entry stays honest: byte-identical Linux native evidence is
paired only with directly relevant unchanged voice start/stop flow witnesses.
It does not claim that Linux source reproduces a macOS permission implementation.

The canonical compressed whole-bundle correspondence and independently
reproducible summary live under [`semantic/`](./semantic/). They validate all
135 obligations, all release bullets, the complete source-tree identity, and
the exhaustive attribution/structural ledgers.

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is the immutable incremental source localization. It is 2,709,667 bytes with
SHA-256
`623cfd2740598d7a6f7cc0a7f72bfebd5000eeae13d6ccb3295f594b0abef794`.
The full-index patch changes 290 paths: 66 additions and 224 modifications,
with 25,828 insertions and 1,994 deletions. It contains no deletions.

Five trailing spaces are intentionally retained because exact authenticated
assistant and Ultraplan prompt bytes require them. They are enumerated in
[`recovered/source-freeze/diff-check-allowlist.txt`](./recovered/source-freeze/diff-check-allowlist.txt);
there are no other whitespace diagnostics. The entire source freeze verifies
in place with `sha256sum -c`.

## Source lineage and handoff orientation

The source base is commit
`bd846a24e3886322888f02b9f747c132a4a32314`, root tree
`695e9409899f783a90899d5ff7b06cef0129b7e0`, and `src` Git tree
`a404264d155cde23ec7479fc7e69d1edec7d92a9`.

The base source summary is 2,022 files, 31,570,676 bytes, and framed SHA-256
`c91ebcc114cbe577e4ffe43801e6014ade8e26d27271f57b0af1ce8ce9ff3d59`.
Applying the overlay produces root tree
`bceb0af2f6b5261fab23b9d8fee51cf48f1b2dd2`, `src` Git tree
`9e807992d428e7e23a0ad96e3a53e286d372afd7`, and a source summary of
2,088 files, 32,357,579 bytes, framed SHA-256
`5b91f7f3ddcdf440a8ef22b7e43eec769402aa54c3f1995ee508adb0c9157882`.

Independent audits regenerated the patch, path/stat/hash inventories, source
identity, apply result, reverse result, and forward replay byte-for-byte. The
86 target tests and 21 retained tests pass in the isolated target. All 278
declared changed TypeScript/TSX entries build.

This case is handed off **applied**. The shared `src/` tree has the exact
2.1.119-facing target identity. Do not apply the overlay a second time. A
deliberate reversibility audit must reverse once, verify the base, reapply, and
finish at the target.

## Verification status

The schema-v4 [`manifest.json`](./manifest.json) binds every published
artifact, generated report, source record, test, and documentation boundary.
The aggregate complete-recovery verifier requires these eleven statuses:

```text
evidence-verified
bun-container-verified
source-lineage-verified
exact-delta-verified
attribution-report-verified
structural-ledger-verified
whole-bundle-source-correspondence-verified
whole-bundle-source-semantics-verified
readable-diff-verified
embedded-code-reconstructed
exact-package-tree-reconstructed
```

The aggregate result is `complete-recovery-verified`. Follow
[`RECOVERY_RUNBOOK.md`](./RECOVERY_RUNBOOK.md) for deterministic replay, the
applied-tree gate, and an optional reverse/reapply audit that ends at the
2.1.119 target.

## Diff orientation

Every delta and ledger is oriented 2.1.118 → 2.1.119. The source overlay has
the same orientation and applies only to the verified 2.1.118 base. The
checked-out tree is already the target after this case is committed; use
`git apply --reverse --check` to confirm that orientation rather than applying
the patch again.
