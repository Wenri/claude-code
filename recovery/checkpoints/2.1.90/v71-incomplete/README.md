# 2.1.90 V71: incomplete source-only checkpoint

Whole-version, runtime, security, global-binding and global-initialization acceptance remain unestablished. Zero historical-region closures are claimed.

Read [detailed gaps](GAPS.md), [full ledger](gap-ledger.json), [CSV](gap-ledger.csv), [strict partition](strict-gaps.json), [verified .89 carry-forward](verified89-carry-forward.json) and [status](STATUS.json).

## Source and personally executed work

Baseline: V70 commit 4889d4a30fbe5f44ed1e6c2f31fa7e628ffd83aa. Only src/tools/BashTool/fileReadState.ts changes among 6,114 files, by minus 52 bytes. The other 6,113 files are byte-identical; total source bytes are 50,692,562. The complete postimage equals the authenticated .89 V45 donor. [Provenance](source-origin-basis.json), [restoration](restoration.json) and [patch](source-changes.patch) record construction. Target content is comparison-only. Donor equality does not transfer acceptance.

The primary personally inspected and reconstructed source, prepared the exact source/profile/toolchain tuple, ran eight gated retry2 actions including five serial diagnostic stages, then ran the complete census and twelve prior/target six-statement owner comparisons. Independent execution review verified all actions, closed products and all 260 protected inventories. Independent census review freshly reproduced the whole strict digest, complete index and nonlocal models. Owner/caller reviewers separately checked the complete finite endpoint and readiness scope.

Two failed startup attempts remain preserved. The first stopped at an environment allowlist; independent probes reproduced Bash exporting OLDPWD after cd. Retry1 preflight child exited zero, but Bun's runtime-transpiler cache violated the empty-HOME postcheck, so that stage remained failed. Retry2 unsets OLDPWD and uses fixed BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 with a fresh HOME; all postchecks passed. The allowlist was not relaxed.

Eleven marker-import deletions account for 217 finalization bytes. Raw/final maps contain 2,080,160/2,080,148 points and 4,788 sources. The inherited userAgent.ts original-column overflow remains. The 37 reconstruction-event multiset matches V70, while callback/native/gRPC ordering differs. Complete data reconstruction does not prove global initialization or source-map semantics. Native/host/library and read-use races remain qualified in [build summary](build-result-summary.json).

## Complete comparisons

The [census](census-summary.json) covers 78 complete partitions, all 18,277 paired statements and 18,278 gaps. There is no insertion, deletion or motion. Exactly 4,396 statement byte sequences and strict digests change; only 11876/11877 change shape. All 4,394 shape-stable changes have complete raw/scope/capture checks: 1,319,660 statement nodes, 39,942 scopes, 7,539 changed identifier occurrences and 49,456 complete free-capture occurrences. This selected set does not prove whole-program binding identity. Only terminal debugId changes among gaps.

All six fileReadState statements pass bounded target protected-field/scoped-graph comparison under the finite map. Their summed nodes are 634; the joined Program has 635 nodes and 32 scopes. None is an exact strict target match. The threshold comparison now uses literal 10485760, its old module declaration disappears, and the complete initializer remains byte-identical. The declaration's 110 shape alternatives remain explicit.

Structural windows fall from 100 to 99. Strict diagnostics remain 363 gaps and 396 anchors. Strict-whole-program-ast-v2 still fails: candidate 3,110,546 nodes / c8d32ef54754147aa807f4234a14b0afb77c187add72805bfee3bf173eb0141a versus target 3,110,206 / c72be899416d2e84a3fd0e5cb5dcd36de1c7949225eb38059001d1334f16c7e7. Supplemental raw comparisons retain ordinary literal spelling.

The finite endpoint union has 1,273 passes and eight failures among 1,281, with exactly two fileReadState improvements and no prior-pass regressions. All ten V70 failure outcomes remain recorded. The 47 actual-order domains have 40 passes, four rejects and three absences. Absence does not prove unreachability. Expanded caller/readiness review covers 67 domains, 1,033 models, 62 initializers, 251 edges and a 20-node selected cycle per version. The source-provider union has 55 modules and 774 exports. See [owner/provider summary](owner-review-summary.json).

## Gaps and diagnostic context

Eight failures remain: LRU and TaskOutput initializer/private-name differences; firstLineOf helper mismatch; four forkedAgent deduplication, default-turn, telemetry and declaration differences; and missing permissions decision-reason metadata. The ledger records source owners, exact mismatch descriptions, field paths, evidence hashes, blockers and next actions.

The primary produced 694 complete neighboring-context texts for 99 windows and all ten prior failures, independently checked by the census reviewer. One additional retained-attempt text is separate. The primary also annotated 149 protected-name differences across LRU and TaskOutput. These are diagnostic descriptions, not a relaxed criterion or accepted private-brand/provider mapping.

All 134 historical regions, 20 individually scoped obligations, three suppliers and old unjoined window 66 remain. Their individual statuses are preserved, including scoped-gate-closed 90-1 with broader acceptance open. R091 still lacks independent .90 source provenance; Trial61 evidence remains unrecovered. Prior R075, R121, lifecycle/hot migration, hook denial/defer, parser/prototype/budget and historical global non-bijection obligations remain.

fileReadState retains source-cycle/global initialization, reflection, stat/read/symlink races, duplicate-read concurrency, abort timing, full-file reads, outside-try errors and swallowed inside-try exceptions. Before initialization, the old emitted var is undefined; the new literal is available if reached. No recovered application, provider, hook, callback, addon or synthetic behavior program was executed for these checks.

## Source-only verification

Archive SHA-256: 39dacff6a582ce57251ce5cf5e6b9ca344a06ad74a600364edc4fb01a0c0856a. Source-manifest identity: 808ed7a074540e57f1bd61767df723307c891366d36b2fe744f0a4f764e0a8da. Derived src tree: d7b008b47ac4492c28bdf0378587ba5997c7854d. The 1,933 Git pins are data-derived identifiers, not a source commit claim.

Run python3 -I -S -B verify.py to authenticate every source member and derived pin. Optional --output requires a fresh destination and extracts data without importing it. SHA256SUMS covers all checkpoint files except itself. Independent publication checks cover extraction, malformed inputs and source-only/privacy boundaries; pattern scanning supplements exact allowlisting and is not a universal secret detector.

This package includes source, manifests, provenance, patch, verifier, backlog and qualified diagnostic summaries. It excludes target/newly emitted programs and maps, raw snippets/models, compiler/runtime profiles and binaries, authentication data and local execution/debug-context payloads. It is not a standalone build package.
