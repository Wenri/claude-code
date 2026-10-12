# 2.1.90 V66: incomplete source-only checkpoint

This records reviewed source and qualified diagnostic findings. Whole-version, runtime, security, global-binding and global-initialization acceptance remain unestablished. Zero historical-region closures are claimed.

Read [GAPS.md](GAPS.md), the [full ledger](gap-ledger.json), [CSV ledger](gap-ledger.csv), [strict partition](strict-gaps.json) and [verified .89 carry-forward](verified89-carry-forward.json) for every carried obligation and concrete next action. [STATUS.json](STATUS.json) summarizes the checkpoint.

## Exact source change

The baseline is V65 commit dbc9a9465a4eab2c63ee6a1f58aa94a444b9973d. Of 6,114 source files, only src/tools/BashTool/readOnlyValidation.ts changes, by +8 bytes; 6,113 files remain byte-identical and no path is added or removed. Total source bytes: 50,692,911. The complete changed file equals accepted .89 V45 donor SHA-256 481187aa6b0981d7f50db55b43e1daf7aa10075221988107fc3e844ba0f4199c.

The five classifier constants and full classifier relocate; echo/ls branches split; two argv regex operands become direct indexed reads; parser-module access becomes direct. Imports and comments remain unchanged. [Source provenance](source-origin-basis.json), [restoration](restoration.json) and the [exact patch](source-changes.patch) document construction. Donor equality does not transfer .90 acceptance. Sparse/exotic argv, null parser readiness, coercion, initializer order, partial cycles and error/cleanup behavior remain explicit limits.

## Personally executed and independently reviewed

The primary author ran five serial diagnostic stages plus full pre/postconditions and sealing. Every action exited zero. Independent review authenticates all 147 protected roots, eight contemporaneous controller prelaunch records, 32 closed outer files and the exact raw-to-final CLI/map reconstruction. It checked all 2,080,174 raw map points to 2,080,162 final points and all 4,788 physical source contents. Eleven marker imports/217 bytes were removed. [Build evidence summary](build-result-summary.json) preserves all timing and environment qualifications.

Full-tree preconditions completed 290.508268 seconds before preflight's fresh native check; that check finished 0.003954 seconds before the stage. The sealed contract has no numeric expiry. No full-tree temporal adjacency, race immunity, complete native-library closure or OS-enforced target-read sandbox is claimed. V62/V63/V64 temporal qualifications and the V65 rejected ambient startup remain historical evidence.

The full [census](census-summary.json) accounts for all 18,277 prior/current statements, including the changed classifier's 7747→7746 movement and 7746→7747. Five aligned statements change strictly, three change shape and 18,272 are byte-identical. Every interstatement gap is accounted once; only terminal debugId text changes. All 13 current read-only owner statements, 4,173 nodes, pass their bounded complete target nominations. All 58 shape/strict partitions are independently replayed. The [owner/provider summary](owner-review-summary.json) keeps inherited and expanded review denominators separate, all exact failures and newly exposed historical scope visible.

Structural windows fall 116→112; R039/R040/R041/R042 disappear only as unmatched structural windows. All 134 historical regions, 20 individually scoped other obligations, three historical supplier obligations and old unjoined window 66 remain. Strict diagnostics stay 371 gaps / 403 anchors, all 403 prior anchors retained. [Allocation effects](allocation-effects-summary.json) and [window summaries](diagnostic-windows.json) are diagnostics only.

Whole strict AST equality still fails: 3,110,583 nodes, SHA-256 b97066fb22fd3c5ae97620cbfb5cd3d9b7e466dfb9ce985de58777931cbe57c4, versus saved target 3,110, 206 nodes / SHA-256 c72be899416d2e84a3fd0e5cb5dcd36de1c7949225eb38059001d1334f16c7e7. The strict-whole-program-ast-v2 criterion is unchanged. Supplementary raw-field audits additionally retain ordinary Literal.raw. Existing userAgent invalid original-source coordinate, 45 generated surrogate-interior coordinates, parser/provider failures, shell-quote conditional package effects, R075 snapshot/non-bijection, R121 hot migration and R091 provenance remain open.

## Source-only verification

The deterministic gzip/PAX source archive SHA-256 is f16ccb1ecb8510b11b0fc216c25204e89177b2d16190d725ae62f587b5417dc3; canonical source-manifest identity 6f2b069e6cfcc33555da7aec844a22b17d3c8e17e707ecc814344986f99ee01d; derived src tree b952447c96173cc1fbedbd2571d60623b43d7eeb. The 1,933 Git source pins are data-derived and do not claim a new Git commit.

Run python3 -I -B verify.py to authenticate every archive member and derived source pin. Optional --output requires a new destination and extracts data without importing it. Root preparation tested nineteen negative controls and exact extraction; independent publication review separately tested thirty-five controls. SHA256SUMS covers all checkpoint files except itself.

All 541 inherited inline maps remain byte-identical historical source metadata; 8,436,898 decoded bytes are scanned with approved sources and curated summaries. Pattern scanning supplements source allowlisting and is not a universal secret detector.

Included are complete source, manifests, source patch/provenance, data-only verifier, historical backlog, detailed gaps and qualified summaries. Excluded are official target, freshly emitted JavaScript/maps, target/emitted snippets and models, full compiler profiles/runtime tools, native binaries, authentication data, private execution paths and local comparison-context payloads. This is not a standalone build package.
