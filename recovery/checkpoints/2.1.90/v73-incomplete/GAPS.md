# 2.1.90 recovery: fresh evidence and unresolved gaps

Updated 12 October 2026, 13:12 UTC. GitHub main was freshly checked at 13:10 UTC: `36402d1715407b3995f7feda52b30849afc83d32`. No new push. This is an incomplete candidate checkpoint.

## Personally executed work

The primary assistant restored and checked the exact V72 source/build inputs; prepared the independently source-reviewed three-file imageFormat candidate; ran both pinned compiler builds and finalizers; generated the target, baseline and candidate inventories; and ran all three complete JSON comparisons. The primary also wrote, corrected and ran the source-owner nomination tool, and inspected the emitted detector, wrapper, resizer and bridge text. No recovered application was executed. Official target bytes were used only for comparisons.

Independent reviewers checked source provenance, candidate preparation, compile/finalize inputs and outputs, all inventory schemas and accounting, and full comparison coverage. Owner nomination output review is closed (seal 259edd2179044fea0c28c3ea524c8b2530377b251e80ab93d6368e7b08b3b7e1); its contextual extension is closed (seal 1a6c1cd7831f2618659c96ba27f9eaa1789f162e3c9e59c164923a0fd5dbb146). A passed gate is a bounded test result, not version acceptance.

## Strict whole-program result

Criterion remains `strict-whole-program-ast-v2`, Acorn 8.15.0 / ECMAScript 2026. Names, order, bindings as represented in the AST, operators and structure remain significant.

| Input | Statements | AST nodes | Strict Program SHA-256 |
|---|---:|---:|---|
| Official target | 18,275 | 3,110,206 | c72be899416d2e84a3fd0e5cb5dcd36de1c7949225eb38059001d1334f16c7e7 |
| Fresh restored V72 | 18,277 | 3,110,548 | 882f02a05ea8b4a70a8ae419d4ade82cc61c66d3a6c7234f479ca9640d079e14 |
| imageFormat candidate | 18,277 | 3,110,542 | f409c18152b8c7c0ce2b8d4ac8b6cf5ec7a683197ef84890a9d485d2656cc662 |

All comparisons fail strict whole-program equality. The fresh V72 digest matches the conversation-recorded pre-loss digest; the original old bundle, execution evidence and local commit remain unavailable. Fresh proof does not recreate old proof. Raw/final byte identities differ from the old recorded ones; the cause has not been established.

## Complete diagnostic comparison coverage

The new global-unique-anchor partition retains all statements and gaps. Duplicate-anchor intervals with identical shape-digest sequences are counted separately below. These metrics are **not** the historical 82-partition census and cannot be compared directly with its 98 windows / 309 strict gaps.

| Comparison | Raw shape gaps | Equal-sequence intervals | Unequal-sequence intervals | Shape anchors | Strict gaps / anchors |
|---|---:|---:|---:|---:|---:|
| Restored V72 → target | 2,992 | 2,897 | 95 | 12,789 | 349 / 370 |
| Candidate → target | 2,991 | 2,899 | 92 | 12,791 | 378 / 399 |
| Candidate → restored V72 | 2,946 | 2,943 | 3 | 12,878 | 2,310 / 14,399 |

Lower shape counts are diagnostic only. Strict anchor changes can reflect compiler naming changes; they do not establish acceptance or a regression count. Every strict gap remains unequal. Candidate comparison evidence seal: `10acb8ed2e873e6525c1d61643c252df1e1c08855c394fa22a520b87d768b92d`.

## Source-owner gaps and concrete actions

| Owner / obligation | Exact observation or mismatch | Evidence and blocker | Next action |
|---|---|---|---|
| imageFormat detector and base64 wrapper | Candidate statements 7008/7009, target shape candidates 7004/7005; neither strict-equal. Detector moves from resizer and flattens the nested WebP conditional into left-to-right conjunction. | Exact accepted .89 donor bytes; independent source review `0d6d06d4…`; candidate source count 6,115, net +128 bytes. Shape does not prove binding correspondence. | Inspect full statement/name differences and source-owned binding graph. Do not rename from target output. |
| imageResizer | 16 map-nominated statements, each with one target shape candidate. Only candidate 7017 / target 7013 is strict-equal in this set. Existing provider initializers remain. | Full emission + map nomination `22612518…`; provider imports were already deferred. No claim that this removes native loading across the whole app. | Preserve complete owner context and trace remaining strict name/ownership differences. |
| inboundMessages | Four nominated statements; three unique shape candidates. Empty initializer at 16244 has 91 target shape alternatives and no strict match. | Candidate initializer is an empty arrow function; baseline wraps a dependency initializer call. All 91 alternatives retained. | Resolve identity from source/dependencies, not similarity or neighboring output alone. |
| Candidate versus baseline | Three unequal shape intervals: 1145 adds/moves detector+wrapper before resizer; 1146 removes their old positions; 2513 changes bridge initializer. Net six fewer AST nodes. | Complete intervals retained: [7006,7010) vs [7006,7008); empty [7023,7023) vs [7021,7023); [16244,16246) on both sides. Movement spans two intervals, so this is not three independent defects. | Continue whole-owner and dependency checks; do not equate interval count with closures. |
| userAgent source map | Source index 1687, src/utils/userAgent.ts, zero-based original line 10 / column 10 points into an empty line (UTF-16 width 0). Generated line 461 / column 1740, segment WAE7B. | Exactly one coordinate anomaly in both fresh raw builds; both finalizers preserve it. Already documented as inherited in the published V71 README. Cause unclassified. Independent finalizer reviews reproduce all segment transformations. | Isolate source-map producer behavior with a separately reviewed generic reproducer. Do not repair evidence or claim full coordinate validity. |
| imageFormat provider log.ts | Inherited .90 adds CLAUDE_CODE_USE_ANTHROPIC_AWS reporting suppression. | Root checked .88 donor and independent reviewer qualified .89 lineage. Candidate does not modify it. | Keep the provider delta explicit in reachability/behavior claims. |
| LRU, historical 2134 | 123 protected-name differences: 85 private, 38 free. | Published V71 ledger; not freshly revalidated as an endpoint in this cycle. | Trace source/toolchain binding ownership. |
| firstLine, historical 2543 | indexOf/slice versus separate helper. | Current whole source equals accepted .89; independent .90 helper provenance absent. | Obtain independent source evidence. |
| TaskOutput, historical 10693 | 26 protected names: 10 private, 16 free. | Published ledger; target substitution prohibited. | Source-owned binding investigation. |
| forkedAgent, historical 12156 | Set/spread versus helper. | Published ledger. | Source-supported helper/topology investigation. |
| forkedAgent, historical 12160 | Default turn, counter, telemetry and last selection. | Published ledger. | Isolate source-backed changes and observable effects. |
| forkedAgent, historical 12161 | Ternary object versus logical-and spread. | Published ledger. | Establish independent source and semantics. |
| forkedAgent, historical 12162 | Null slot versus numeric 50 plus null group. | Published ledger. | Independent argument provenance. |
| permissions, historical 12846 | Missing originalDecisionReasonType telemetry. | Published ledger. | Find independent source evidence. |
| R091 | Paragraph source provenance missing; historical Trial61 proof unavailable. | Explicit evidence-loss ledger. | Keep blocked until independent provenance is available. |
| R121 / suppliers / window66 | Dependency 8→10, hot migration, global WO+j17→_A non-bijection. | Historical obligations still open. | Recreate full owner/supplier census with fresh emission evidence. |
| Desktop / semver / SDK facade | Old 17 local passes and 1,281 continuity comparisons are historical only. Semver holder token identity gap and SDK callback order qualification remain. | Old census unavailable; fresh whole-program digest does not replace endpoint proof. SDK order changed coreTypes→runtimeTypes→toolTypes to runtimeTypes→toolTypes→coreTypes. | Rebuild the full continuity/owner checks, retaining all eight endpoint failures until freshly resolved. |
| Publication and recovery | Original V72 commit 636d935bf88222ac9c8b3c71f340ed6115ab39fd unavailable; GitHub still 36402d1. | Exact inputs are restored; fresh execution proof now exists separately. | Persist fresh source/evidence package and independently review an explicitly incomplete public checkpoint before any authorized push. |

## Preserved historical scope

All 134 historical regions, 20 individually scoped obligations, three suppliers, window66, R091 and the eight historical endpoint failures are carried forward with their recorded statuses. Historical 90-1 has a closed scoped gate with broader acceptance open; window66 is structurally absent but its unjoined obligation remains. Zero new accepted closures. The published V71 GAPS.md and ledger remain carried forward in full; this document adds fresh evidence without replacing those obligations. Accepted .89 source supports a candidate, never transfers version acceptance.

Published historical inventory: https://github.com/Wenri/claude-code/blob/36402d1715407b3995f7feda52b30849afc83d32/recovery/checkpoints/2.1.90/v71-incomplete/GAPS.md
