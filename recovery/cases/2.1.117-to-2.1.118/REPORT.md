# Claude Code 2.1.117 → 2.1.118 recovery report

## Result

Claude Code 2.1.118 is complete at the authenticated thin-wrapper and Linux
x64 embedded-generated-code layers. It is the next published npm release after
2.1.117; no version is skipped.

- The exact 13,234,708-byte Bun-wrapped CLI entry reconstructs from the
  authenticated 2.1.117 entry and a deterministic Zstandard dictionary delta.
- The image and audio helper JavaScript entries also reconstruct exactly. All
  three target plain-JavaScript entries contain 13,239,834 bytes.
- The complete seven-member wrapper reconstructs exactly. Five members are
  reused byte-for-byte; deterministic payloads recover `package.json` and
  `sdk-tools.d.ts`.
- The signed 239,573,632-byte Linux x64 executable is authenticated as an
  immutable input. Its Bun section, five-record directory, JavaScript, JSC
  cache, and native-addon ranges are independently parsed and verified.
- All 13,234,618 UTF-16 code units in the analyzable CLI interior are covered
  by an exhaustive interleave of 29,640 exact anchors and 29,641 partitions.
- All 4,143,320 target JavaScript tokens and 20,986 top-level units are
  classified in the structural ledger.
- A 73-obligation semantic catalog covers all 34 official release bullets and
  39 hidden application behaviors. The whole-bundle correspondence accounts
  for all 4,143,320 tokens with zero unclassified tokens, zero unresolved
  application owners, and zero unverified obligations.
- The frozen incremental source-facing overlay changes 306 paths and produces
  an exact 2,022-file target tree. All 280 declared TypeScript/TSX paths pass
  Bun construction, and four focused test files pass 21/21 in both source-tree
  orientations.

The native executable is authenticated and container-verified, not rebuilt as
an ELF file from 2.1.117. The JSC cache and native addons are authenticated
binary ranges, not authored JavaScript. No target source map exists, so exact
TypeScript names, types, comments, formatting, and original module boundaries
remain partially unobservable. The final case therefore retains the label
`generated-code-complete-linux-x64-source-partial` even after the defensible
source-facing overlay is frozen.

| Layer | Current result |
| --- | --- |
| 2.1.118 thin wrapper | Exact, seven members and 132,031 bytes |
| Linux x64 native executable | Authenticated and Bun-container verified |
| Embedded CLI JavaScript | Exact, 13,234,708 bytes |
| All embedded plain JavaScript | Exact, three files and 13,239,834 bytes |
| Target generated offsets | 13,234,618 / 13,234,618 accounted |
| Target JavaScript tokens | 4,143,320 / 4,143,320 classified |
| Semantic correspondence | 73/73 obligations verified; zero unverified |
| Incremental source overlay | Frozen, reversible, 306 paths; applied target |
| Original authored spelling | Partially unobservable |

## Adjacent release and provenance

The npm registry sequence places 2.1.118 immediately after 2.1.117. The
2.1.118 Linux x64 package was published at
`2026-04-22T23:47:07.822Z`; the wrapper followed at
`2026-04-22T23:48:56.690Z`.

Upstream Git has two changelog-only commits between the release tags rather
than direct tagged-parent adjacency:

```text
2fa67717b8046c253cfa55fd84002e3501f1eca6  (v2.1.117)
  ↓
9afdfd7dc06fad5a924a9e87563f1eb924720221  (untagged changelog commit)
  ↓
925200dffc3d0aea02ffa9aa234b22d5efb63bc3  (v2.1.118)
```

The full public tag-to-tag diff changes only `CHANGELOG.md` (+38/-0). The
signed npm artifacts remain the executable authority. The pinned 3,918-byte
2.1.118 changelog section has SHA-256
`3a6edbf3f74375c4f6e21734ff2e187197b6f2fc763e1077eb949bb867a4b742`
and 34 bullets. Both target tarballs pass registry SHA-1, SHA-512 SRI, and
ECDSA P-256 signature verification under npm key
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Immutable target evidence

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.118 wrapper tarball | 13,541 | `6bf12298233cbe70f0412000772bea927f0d000b90debc2e78fbf1db69fa6c47` |
| 2.1.118 Linux x64 tarball | 75,226,490 | `9265b84455ce045a77e89a822ddeed6dabfbb920a4cda5e8f38ef1ec55d7c45c` |
| 2.1.118 Linux x64 executable | 239,573,632 | `ba363b2410a47120d2d4b8ece2e11fe0bbc5d59adb1329e8fb87ea0f370f4e46` |
| 2.1.118 raw embedded CLI | 13,234,708 | `fbf6347d8ba29bfd37c48471e77e635180918e45be61ec8c49cfacd70ffb37ba` |
| 2.1.118 analyzable CLI | 13,234,618 | `84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa` |
| 2.1.118 declarations | 117,452 | `8f907e0e9fd160b857d25881375f73f1bddd3642d372ad52ea71d7ff441f3ddf` |
| Pinned full changelog | 250,079 | `16b8c952c057d9ad82090afb659f3ad116a583211994faf67fc47b61efa5df2b` |

## Exact wrapper and embedded-code recovery

[`package-members.json`](./package-members.json) proves that the wrapper has
the same seven paths as 2.1.117: five unchanged and two changed, with no
additions, removals, or mode-only changes. Replay produces 132,031 target
member bytes and framed-tree SHA-256
`72c0c29d2bf08d2309560c7496ae91a2c1282b2f452ec484114f971d67a99094`.

The five deterministic payloads under [`diff/`](./diff/README.md) contain
2,163,251 bytes. They reproduce the raw CLI, both helper JavaScript modules,
the wrapper manifest, and the declaration file byte-for-byte. The three target
plain-JavaScript entries have framed-tree SHA-256
`ace0550ae45d75efbd936921f235c9eebc9950fa2d53e418f9541553f136c3eb`.

## Bun graph and generated-code accounting

[`binary-extraction/inventory.json`](./binary-extraction/inventory.json)
freezes direct authenticated slices. `bun_graph` is discovery evidence; direct
slicing is canonical because its extraction rewrites `/$bunfs/root/` paths and
its displayed string pointers precede their bytes by eight bytes.

The target `.bun` section is 130,861,588 bytes at executable range
`[108707840, 239569428)`. It contains a 115,670,272-byte JSC cache, the three
plain-JavaScript entries, and two unchanged native addons. The exact pointer
rule and all hashes are documented in
[`binary-extraction/README.md`](./binary-extraction/README.md).

The attribution inventory is exhaustive rather than merely partition-based.
[`attribution/target-ranges.jsonl.gz`](./attribution/target-ranges.jsonl.gz)
interleaves all literal anchors and partitions into 59,281 ordered ranges whose
combined UTF-16 length is exactly 13,234,618. Three conservative unresolved
partitions span 2,181 units; their bytes remain present in the exact target and
in every generated ledger. This measures ownership confidence, not recovery
completeness.

The structural classification is:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,857 | 3,337,126 |
| Moved structural match | 1,676 | 37,152 |
| Coarse changed candidate | 588 | 134,622 |
| Unresolved pairing | 1,865 | 634,420 |
| **Total** | **20,986** | **4,143,320** |

The exact structural fraction is about 81.44%; including supported moved and
coarse-changed pairings yields about 84.69%. The readable comparison is a
review layer only; exact replay always uses the raw dictionary payloads.

## Semantic and source-facing recovery

[`semantic/obligations.json`](./semantic/obligations.json) freezes 73
authenticated behavior obligations: 62 adjacent changes and 11 inherited
source-mirror gaps. Thirty-four obligations cover the 34 official release
bullets exactly once; 39 hidden obligations close target-backed application
behavior not enumerated by the changelog. Together they carry 121 authenticated
target fragments, 149 recovered source assertions, and one explicit source
removal. All four test-catalog entries are used.

Seventy obligations use generated ownership attribution directly. Three
fail-closed `authenticated-behavior-test` localizations cover boundaries where
claiming a generated ownership bridge would be false: Config-tool
unregistration, the authenticated daemon schemas, and keybinding DOM dispatch.
Each binds count-different bundle evidence and recovered paths to a hash-pinned
focused test.

The canonical compressed correspondence report is 710,482 bytes with SHA-256
`be4c1537e82f4666a3f45f67c65551940297514308e5bec1f82a24362af84e59`.
It classifies all 20,986 structural regions and all 4,143,320 target tokens,
with zero unclassified tokens and zero unresolved application-source owners.
The catalog has zero external, unobservable, or otherwise unverified
obligations. The independently reproduced 4,690-byte summary has SHA-256
`91cf36ee4b348ba2de247f2ee6f930349611377ca9e3c31ff8cedf78a2f279ca`.

[`recovered/source-facing-overlay.patch`](./recovered/source-facing-overlay.patch)
is the frozen reversible 2.1.117→2.1.118 source-facing localization. It is
3,865,180 bytes with SHA-256
`fc47a3190c81fc255b9e497af3cb95eb97ef6371ea359fb4c12a7e16f82500d4`.
The full-index patch changes 306 paths: 241 modifications and 65 additions,
with 21,736 insertions and 3,261 deletions. It contains no deletions.

The source record freezes 55 authenticated bundle fragments, exact base and
target states for every changed path, and a 17-entry edit/boundary ledger. The
55 fragments include one target removal; 54 target-present fragments are also
executable target assertions in the manifest. Exactly three authenticated
Managed Agents documentation files retain their target EOF blank lines and
are the only diff-check exceptions.

Both the independent semantic and mechanical audits approved the final
overlay. The semantic freeze verdict is **SEMANTIC SOURCE FREEZE APPROVED —
zero remaining application-semantic gaps.** This establishes target-backed
source-facing behavior, not the unobservable original authored spelling or
module topology.

## Source lineage and handoff orientation

The verified source base is commit
`ff0339d35906735273ae3130a187bb8e30581871`, whose `src` Git tree is
`c9e15117699a700016fee35a941dc3896208819f`.

The base source summary is 1,957 files, 30,993,723 bytes, and framed SHA-256
`135719f7be0cccc9e4658e0f7b78d46e52d947cc171a9bf80b36e1081d727cee`.
Applying the overlay produces 2,022 files, 31,570,676 bytes, and framed
SHA-256
`c91ebcc114cbe577e4ffe43801e6014ade8e26d27271f57b0af1ce8ce9ff3d59`.
All 280 target-existing declared TypeScript/TSX paths pass Bun construction.
The four focused test files pass 21/21 in both the clean base and applied
target; the tightened lineage verifier also byte- and hash-checks those tests
and their imported helper closure.

This case is handed off **applied**. The shared `src/` tree now has the exact
2.1.118-facing target summary. Recovery verification first ran in a disposable
applied-target worktree and returned that worktree to its base; after the
frozen overlay was applied to the shared tree, the source-lineage and complete
gates passed again in place. Do not apply the overlay a second time.

## Verification status

The frozen schema-v4 manifest is 328,242 bytes with SHA-256
`eea9a8e3399bda017c1ff278ed283b4e3653d9c546959ad5c1028b606032187b`.
The complete recovery gate passes both in the disposable applied target and
again in the applied shared tree with these eleven statuses:

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

The aggregate status is `complete-recovery-verified`. Follow
[`RECOVERY_RUNBOOK.md`](./RECOVERY_RUNBOOK.md) for deterministic regeneration,
an applied-target complete gate, and an optional reverse/reapply audit that
ends at the applied target.

## Diff orientation

Every payload and ledger is oriented 2.1.117 → 2.1.118. The source-facing
overlay has the same orientation and applies only to the verified 2.1.117
base. The checked-out tree is already the verified 2.1.118 target, so do not
apply the patch again. For a deliberate reversibility audit, reverse it once,
verify the base, then reapply it and finish at the target.
