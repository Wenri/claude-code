# 2.1.90 V69: incomplete source-only checkpoint

Whole-version, runtime, security, global-binding and global-initialization acceptance remain unestablished. Zero historical-region closures are claimed.

Read [GAPS.md](GAPS.md), the [full ledger](gap-ledger.json), [CSV ledger](gap-ledger.csv), [strict partition](strict-gaps.json), [verified .89 carry-forward](verified89-carry-forward.json) and [STATUS.json](STATUS.json).

## Exact source change

Baseline: V68 commit 726a1c65a90b49363d2eaf3f0bcb3e3b910d4faa. Only src/utils/bash/bashParser.ts changes among 6,114 source files, by -346 bytes. All other 6,113 files are byte-identical, with no added or removed paths. Total source size is 50,692,764 bytes.

The restoration replaces 29 indexed last-element reads with at(-1), across 19 complete functions and 28 hunks. The assignment left-hand side at line 2629 remains indexed. The entire postimage equals the authenticated .89 V45 donor. [Provenance](source-origin-basis.json), [restoration](restoration.json) and [exact patch](source-changes.patch) document construction. Target content supplies comparison evidence only; donor equality does not transfer acceptance.

## Personally executed and independently reviewed

The primary author ran preconditions, five serial diagnostic stages, postconditions and sealing. All eight actions exited zero. Independent execution review authenticates all 216 protected roots, reconstructs every final CLI byte from 11 marker-import deletions (217 bytes), and checks all 2,080,172 raw / 2,080,160 final map points against all 4,788 physical source contents. V69 has 33 reconstruction events. The [build summary](build-result-summary.json) retains timing, environment and historical limitations.

Full-tree preconditions completed 6.361286 seconds before the fresh preflight native check. Per-stage native-check-to-launch intervals were 3.428–4.721 ms. These checks do not establish race immunity, uninterrupted exclusivity, full dynamic-native closure or OS-enforced target-read isolation. The inherited userAgent.ts source-column exception is retained.

The [full census](census-summary.json) accounts for every one of 18,277 prior/current statements and 18,278 gaps, without motion, insertion or deletion. Exactly 19 parser statements change structure and bytes; all other 18,258 statement bytes match V68. Only the terminal debugId differs among gaps. All 70 shape/strict partitions are independently checked. There are no shape-stable changed statements, so an empty capture-check set is not a global binding proof.

The primary author read all 82 emitted parser-owner statements and ran 164 prior/current and target/current complete comparisons. The owner has 80 emitted functions, 21,883 summed statement nodes, 21,884 joined Program nodes and 417 local scopes. Every selected endpoint and the actual-order whole-owner join pass bounded finite-map comparison. An inverse of all 29 changes reproduces the full 21,913-node V68 model. The source has 81 top-level functions; the unused ensureParserInitialized function is not a standalone emitted owner declaration. Three target shape nominations have alternatives, which remain recorded.

Structural windows fall 110→102. Strict diagnostics remain 363 gaps and 396 exact anchors. All 134 historical regions, 20 individually scoped obligations, three historical suppliers and old unjoined window 66 remain. Whole strict equality fails: 3,110,550 nodes, SHA-256 8f060d4a491d4514b898d4202cf4a03fac64f5ce702da0361321c1102ab1f235, versus target 3,110,206 nodes / c72be899416d2e84a3fd0e5cb5dcd36de1c7949225eb38059001d1334f16c7e7. strict-whole-program-ast-v2 is unchanged; supplemental raw comparisons additionally retain ordinary literal spelling.

## Remaining complete gaps and caller limits

The [owner/provider summary](owner-review-summary.json) retains all denominators and all 32 V68 failure outcomes. Nineteen parser endpoints improve, with no prior-pass regression. The original 1,193 endpoints now have 1,182 passes and 11 rejections; the 88 additional endpoints remain 86 passes and two rejections. The finite union is 1,281 endpoints, 1,268 passes and 13 rejections.

Remaining failures: four forkedAgent endpoints, three toolHooks, two fileReadState, and one each in permissions, firstLine/stringUtils, TaskOutput and LRU initialization. They include the extra grouped declaration initialized to 10485760 and missing originalDecisionReasonType telemetry field. These endpoint bytes are unchanged from V68. Their complete raw/model/scope differences, exact source owners and next actions remain in the ledger. Whole-domain ordering failures are separate from endpoint passes.

The expanded caller analysis tracks 155 identities and 213 containing statements. Its 49 requested readiness domains cover 810 statements and a 16-node selected cycle. The retained historical subset has 35 domains, 731 statements, 31 initializers, 83 potential edges and the same 10-node cycle in both versions. The larger cycle belongs to expanded coverage and is not a V69 regression. All 134 historical caller-containing statements pass prior/current comparison. The original 668 boundary pairs retain 649 passes and the 19 expected parser changes.

at(-1) adds observable method lookup/call, availability, prototype/species/getter/proxy/coercion/reentry and timing assumptions. The empty-capable expansion read can distinguish inherited negative-index access. The preserved 50 ms/50,000-node budgets do not make timing equivalent. Changed synchronous parser reads normally lie inside parseSource's catch and produce null on ordinary thrown errors; pre-try setup, unprotected panic telemetry and later walker/provider failures have different boundaries. Ordinary too-complex results can select an always-true hook matcher, whereas escaping conditioned lookup failures can suppress the matched collection. No runtime exploit, universal fail-closed behavior or cleanup guarantee is claimed. MODULE/READY, mutable Sets/tables, loader/cache and global initialization remain open.

R091 still lacks independent .90 provenance for its missing paragraph. R121 dependency/lifecycle, prior global non-bijection, Trial61 provenance and historical execution qualifications remain unresolved. No source repair is inferred solely from target output.

## Source-only verification

Deterministic archive SHA-256: 3ae18c7a5f33306da3741af1aab93452659c25fd6bf8387a5e6bb0902fa435c4. Source-manifest identity: bfa5a6ecf31d5f6c437bca1761627b84bdb3fe7f8fbfb3bf16ffb228aa9a227d. Derived src tree: 38d5b7d1d8caed91eb54bb500d78b924a2a93d53. The 1,933 Git pins are data-derived identifiers, not a source commit claim.

Run python3 -I -B verify.py to authenticate every source member and derived pin. Optional --output requires a fresh destination and extracts data without importing it. Root checks reject nineteen malformed-input cases and verify exact extraction. Independent publication checks are separate. SHA256SUMS covers every checkpoint file except itself.

All 541 inherited inline maps remain byte-identical source metadata; their 8,436,898 decoded bytes are scanned with the approved source and curated metadata. Pattern scanning supplements exact source allowlisting and is not a universal secret detector.

This checkpoint includes source, manifests, provenance, patch, verifier, backlog, detailed gaps and qualified summaries. It excludes target and fresh emitted programs/maps, snippets/models, runtime/compiler profiles and tools, native binaries, authentication data, private execution paths and local debug-context payloads. It is not a standalone build package.
