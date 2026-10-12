# V71 comparison-context diagnostics

This source-only diagnostic supplement refers to [V71 commit 3413291](https://github.com/Wenri/claude-code/commit/3413291bb2d722d3b8e5745ef2f063f073d5f74e). It makes no recovered-source, compiler, finalizer, naming or acceptance change. The [complete V71 gap inventory](../../../checkpoints/2.1.90/v71-incomplete/GAPS.md) remains authoritative and unchanged.

## Structural context annotator

`annotate_structural_context.py` reads a hash-pinned endpoint JSON. It independently reconstructs that endpoint's complete supplemental raw AST differences and refuses an incomplete or duplicate difference list. For every existing difference it retains the original record, explicit presence/absence on both sides, the nearest existing AST node, its parent, enclosing declarations, UTF-16 spans, exact context text and text digests. Missing fields and present null values remain distinct.

Run with Python 3.12 and the standard library only:

    python3 -I -S -B annotate_structural_context.py endpoint.json context.json --sha256 <endpoint-file-sha256>

Output is created exclusively; an existing file or final-component symlink is not overwritten. The caller must select trusted, quiescent input and parent directories. Output may contain full compared source text and must remain comparison evidence. Do not feed it to source construction, compiler input, finalization, naming, training or acceptance normalization.

Required endpoint fields are `currentIndex`, `targetIndex`, `owners`, `targetRawDifferences`, and `current`/`target` objects containing `text`, its UTF-8 `sha256`, and a parsed `ast` whose ranges are statement-relative half-open UTF-16 code-unit spans. Paths use string object keys and canonical decimal array indexes. Positions (`start`, `end`, `range`, `loc`) are omitted only while reconstructing supplemental differences. Ordinary `Literal.raw` remains in these diagnostics; the unchanged strict criterion handles it separately.

The tool is bounded to the pinned JSON AST representation. It is not a general JavaScript value comparator or syntax validator. Stored parser output, full program identity beyond the supplied statement, binding resolution, effects, runtime brands and provider behavior require independent evidence. Positional AST differences are not semantic edit correspondences, and their count is not a defect count. Syntactic `owners` are source-map nominations, not a newly established semantic ownership proof.

## Results and limits

The primary ran all six structural endpoints: 2543, 12156, 12160, 12161, 12162 and 12846. Their complete supplemental difference counts are 6, 6, 39, 13, 4 and 220, totaling 288. All 576 side contexts are retained. The public CLI produced byte-identical reports to the original diagnostic; output data are intentionally excluded from this source-only package.

The separate private catalogue diagnoses endpoints 2134 and 10693: all 503 private occurrences, including 60 declaration keys and 443 uses, select aligned endpoint-local declaration paths. Its independent review passed bounded syntactic checks. Each private occurrence must have exactly one AST class ancestor with no superclass; private-free nested and derived classes are outside that gate. Private accessors and unsupported private occurrence forms are rejected. Receiver identity, full AST schema, ranges in the catalogue comparison itself, runtime private brands and behavior are not established. A separate review authenticated original ranges. No renaming or semantic equivalence is accepted.

All eight endpoint failures remain. Strict whole-program equality still fails. All 134 historical regions, 20 individually scoped obligations, three supplier obligations and old unjoined windows remain in the complete V71 ledger, including the individually scoped closed gate and R091's missing provenance. Accepted region closures remain zero.

## Source evidence and next actions

- `src/utils/stringUtils.ts`, endpoint 2543: inline first-line implementation versus a helper call. Accepted .89 and current bytes already match. Seek independently sourced helper/provider and permissible lowering evidence.
- `src/utils/forkedAgent.ts`, endpoint 12156: Set/spread construction versus a helper call with an intended deduplication role. Provider equivalence is unproved; require independent provider/source evidence.
- The same owner, endpoints 12160/12162: missing default-turn logic and declaration, assistant counting and telemetry, plus different last-message access. Review a complete independently sourced owner/dependency proposal together; target observations cannot supply construction bytes.
- The same owner, endpoint 12161: conditional versus logical-AND telemetry spread. Require independent source or compiler-lowering evidence before attempting a source transformation.
- `src/utils/permissions/permissions.ts`, endpoint 12846: missing decision-reason telemetry property; later property positions and generated names also differ. Historical .90 and later source overlays are target-derived and cannot serve as independent donors.
- `node_modules/lru-cache/dist/esm/index.js` and `src/utils/task/TaskOutput.ts`: preserve the private catalogue diagnostic and all unresolved free-provider, strict-name, initialization and runtime obligations.

Later-source provenance review found no admissible independent later donor among the supplied records. The historical .88 reconstruction input archive and accepted .89 inputs authenticate selected retained bytes; this does not authenticate a missing original .88 npm artifact or establish .90 acceptance. Needed for source trials: attributable independent source evidence and an admissible construction route, followed by the existing complete review/build/comparison gates.
