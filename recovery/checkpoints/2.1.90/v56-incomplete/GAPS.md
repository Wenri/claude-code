# .90 V56 detailed gap checkpoint

## Bottom line

V56 is **not accepted**. Its strict whole-program AST has 3,110,747 nodes and digest `7275012ba6fa8bdc9e8cf59d0c7f9483710e87a45b988b13a43cb58ce387242a`; the official comparison has 3,110,206 nodes and digest `c72be899416d2e84a3fd0e5cb5dcd36de1c7949225eb38059001d1334f16c7e7`. The 541-node difference is only a size comparison, not a complete diagnosis.

- 128 current shape-diagnostic windows; all 134 historical region records and 20 other historical backlog rows are retained.
- 277 strict partition gaps and 289 exact statement anchors, versus 206/213 in V55. These are alignment diagnostics, not defect counts or completion percentages. Compiler allocation changes affect both counts.
- Six bounded structural repairs: R018, R051, R067, R101, R102 and R129. None is an accepted package/global/whole-version closure.
- V56 changes three statement shapes, indexes 9027–9029, all mapped to the intended remote-settings source. There are no other shape changes versus V55. Of 7,342 strict-changed statements, 7,339 are shape-stable and receive separate complete static field/scope/capture inspection.
- 92 mapped residual source owners: {'changed-from-verified-89': 49, 'identical-to-verified-89': 42, 'new-in-90': 1}. Statements 8763, 8764 and 17894 remain selected but unmapped. Source contribution does not establish target authorship or semantic ownership.
- Nomination inventory: {'unique_outside_ordered_partition': 19, 'unmatched': 258, 'ambiguous_multiple': 19}. Unique shape nominations outside the ordered partition remain unaccepted.

## Hands-on actions and independent review

I personally prepared the R051 source correction from the authenticated accepted .89 donor, inspected its four hunks and provider boundaries, then ran V56 preflight, compilation, finalization, strict AST hashing and statement indexing. I reverified the pinned sources/tools before and after execution. I personally inspected the three complete emitted owner slices and adapted/executed the full census plus the nonlocal static field/scope/capture checks.

Independent reviewers checked the source proposal, isolated input/tool tuple, all three complete emitted owners and census evidence. Supporting preparation and independent review are separate from my own execution. No recovered application, provider, callback, hook or native addon was executed.

R051 owner evidence: 32/196/71 nodes, 299 total, retain control order, Literal.raw and declaration/reference/read/write/init structure under an explicit cross-owner-consistent capture mapping. Raw AST differences remain: 7/26/10 identifier occurrences, 43 total (11 bound, 32 free). All 51 free occurrences map to source identifiers; all 244 source-map segments authenticate. The empty override provider remains unchanged. Truthy override behavior, changed auth/settings providers and transitive initialization remain explicit limits.

Nonlocal inspection: 7339 complete statements, 2136229 nodes, 28249 ordinary identifier-name differences, and 15120 changed free-capture occurrences. Exception statements: []. All raw changes are ordinary Identifier.name fields; local declaration/reference/read/write graphs match. This does not establish global binding or initializer identity.
Complete capture collision check covers 101556 occurrences. Per-statement collisions: []; selected-statement forward conflicts: []; reverse conflicts: []. Unchanged statements and supplier identity still require global evidence.

## What verified .89 contributes

The complete accepted .89 V45 inputs were authenticated by composing the pinned .88 baseline with the committed V45 overlay. Against V54, 5,913 inputs were identical, 171 changed, 30 added and three removed. Twenty-one V54 files still matched the older baseline despite later accepted V45 corrections. V55 repaired R067 using its originally recorded shellCompletion donor; accepted-.89 overlay corroboration was found afterward and does not rewrite that derivation. V56 restores R051 directly from the authenticated accepted-.89 source.

There are now 19 exact older-baseline files among those original candidates, including 16 first-party files mapping to 29 current windows. Three vendor files contain version-specific ambient-name patches and are not bulk-port candidates. Fifteen partially changed files retain nominated .89 hunks but are not safe whole-file replacements.

.89 supplies independent donor source, not automatic .90 acceptance. Preserve actual .90 source changes and changed provider interfaces; never construct compiler input by transplanting comparison-target text.

### Ranked next source work

1. **R019 markdown configuration:** I prepared the exact accepted .89 removal of the disabled template-array spread. Independent source review passes conditionally. It is not in V56. Next: personally prepare isolated pins, obtain tuple review, build, inspect its complete initializer/captures and refresh the census. TEMPLATES remains disabled in this profile; do not claim equivalence for enabled features or modified iterators/prototypes. Removing the templates alternative can narrow ClaudeConfigDirectory even though its declaration text is preserved; no type checker was run.
2. **R027–R034 Bash parser:** inspect 29 accepted .89 `.at(-1)` substitutions and their producer/caller domains. Custom methods/prototypes, sparse arrays and empty inputs preclude blanket equivalence.
3. **R059 argument substitution:** inspect accepted parseCommandArguments reuse. Its provider matches V45; preserve parsing and substitution order.
4. **R069/R070 team-memory errors; R098/R099 plugin modal sizing; R121 permission-hook dependencies; R124/R125 prompt width:** use authenticated donor hunks with complete owner/provider review.
5. **R096 desktop handoff:** consumer import/interpolation also requires a provider export. Keep other .90 provider changes; do not replace the whole provider blindly.

**Blocked: R091 prompt paragraph.** The missing 432 characters have only official-target/target-derived support. Authenticated .89 and current .90 source both omit them. Independent .90 source/version-delta provenance is still required.

## Remaining gap classes and acceptance gates

- **Source/control/literal differences:** current windows remain explicit. Inherited obligations are retained, not newly certified as causes.
- **Compiler/private naming:** comparison analysis found 11 unchanged .89 owners spanning 12 statements with ordinary allocation differences and 159 PrivateIdentifier-name occurrences. Exact class/brand/binding evidence is needed; no blanket name erasure or fixed .89 naming recipe.
- **Build metadata:** four native/gRPC owners retain build-2201 literals versus build-2211 in .90. Two inherited virtual-path tools hard-code build-2201, so a profile-only edit is insufficient. Verify build/tool provenance and native-loader contracts; do not hardwire target bytes into finalization patches.
- **Global binding and initialization:** local alpha correspondence does not establish global identity, reflection/direct-eval behavior, ambient probes or initializer ordering.
- **Provider/runtime:** lifecycle, React/Ink timing, external builtins/prototypes, callbacks, failure/reentry, native filesystems and transitive providers remain unaccepted.
- **Historical audit chain:** the original partition generator is unavailable; the explicit compatibility generator reproduces all V52 windows and saved V53–V55 shape/strict partitions. Original Trial59/60 source maps and Trial61 evidence remain unavailable.

Strict full AST fidelity remains the acceptance criterion. Historical decision rows are retained for traceability and do not authorize weakening it.

## Complete machine-readable inventory

- [gap-ledger.json](gap-ledger.json): all 134 regions, current/historical ranges, statement hashes, owners, .89 relationships and next actions.
- [gap-ledger.csv](gap-ledger.csv): the same region inventory for filtering.
- [strict-gaps.json](strict-gaps.json): all 277 strict intervals and 289 exact anchor pairs.
- [verified89-carry-forward.json](verified89-carry-forward.json): all 21 original candidates, donor origins and current V56 status.
- [saved-backlog.csv](saved-backlog.csv): unchanged 154-row historical backlog.

Current-window inherited-status counts: acceptance-domain decision: 10, not yet diagnosed: 43, proof needed: 75.

## Every historical region

Ranges are zero-based half-open statement indexes. Repaired rows retain historical correspondence and current evidence, with strict/package obligations open. Completion criteria are unchanged historical text and can mention already repaired work; currentStatus and nextAction govern current work.

### 90-8.R000 — 90-8.05 Namespace and cluster helper placement (src/utils/envUtils.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 0; target [603, 603]; candidate [603, 604]; target-minus-candidate nodes: -13.
- Source: `src/utils/envUtils.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 603. Trace complete helper consumers and initialization/observation order, including the two exact locations. This row shares the complete closure criterion with the other rows in 90-8.05. Owner role: Compiler/binding and source-owner proof reviewer. Also tracked under 90-5; same obligation.
- Inherited completion criterion: Prove the target 604/current 603 empty namespace/cluster helper identity, all uses and safe definition/initialization placement. Both insert/delete sides close together; previous telemetry repair is insufficient. Close together with 90-8.05; local closure does not close 90-9.

### 90-8.R001 — 90-8.05 Namespace and cluster helper placement (paired placement/source scope)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 1; target [604, 605]; candidate [605, 605]; target-minus-candidate nodes: 13.
- Source: Unmapped or target-only; do not invent an owner.
- Next: Trial 68 target statements: 604. Current statements: none (target-only deletion). Trace complete helper consumers and initialization/observation order, including the two exact locations. This row shares the complete closure criterion with the other rows in 90-8.05. Owner role: Compiler/binding and source-owner proof reviewer. Also tracked under 90-5; same obligation.
- Inherited completion criterion: Prove the target 604/current 603 empty namespace/cluster helper identity, all uses and safe definition/initialization placement. Both insert/delete sides close together; previous telemetry repair is insufficient. Close together with 90-8.05; local closure does not close 90-9.

### 90-8.R002 — 90-8.21 LRU-cache private bindings (node_modules/lru-cache/dist/esm/index.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 2; target [2134, 2135]; candidate [2134, 2135]; target-minus-candidate nodes: 0.
- Source: `node_modules/lru-cache/dist/esm/index.js` (identical-to-verified-89)
- Next: Trial 68 target statements: 2134. Current statements: 2134. Analyze the full LRU class and initialization graph, preserving every non-private field. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Establish a complete class-scoped private binding/brand bijection for this exact LRU initializer, public properties, captures and initialization; no TaskOutput certificate transfer. Close together with 90-8.21; local closure does not close 90-9.

### 90-8.R003 — 90-8.27 Native path import and consumers (src/utils/path.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 3; target [2178, 2179]; candidate [2178, 2179]; target-minus-candidate nodes: 3.
- Source: `src/utils/path.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 2178. Current statements: 2178. Trace imports, source uses and native provider interfaces. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the differing native path specifier set against all concrete consumers and module initialization effects. Close together with 90-8.27; local closure does not close 90-9.

### 90-8.R004 — 90-8.22 signal-exit private bindings (node_modules/signal-exit/dist/mjs/index.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 4; target [2256, 2257]; candidate [2256, 2257]; target-minus-candidate nodes: 0.
- Source: `node_modules/signal-exit/dist/mjs/index.js` (identical-to-verified-89)
- Next: Trial 68 target statements: 2256. Current statements: 2256. Build a distinct exact-class proof; preserve callback registration and exit behavior. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Establish the complete signal-exit wrapper private binding/brand graph, captures and initialization under its own exact scope. Close together with 90-8.22; local closure does not close 90-9.

### 90-8.R005 — 90-8.28 String newline helper specialization (src/utils/stringUtils.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 5; target [2543, 2545]; candidate [2543, 2544]; target-minus-candidate nodes: 10.
- Source: `src/utils/stringUtils.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 2543, 2544. Current statements: 2543. Recover the complete stringUtils helper/caller graph before considering inlining equivalence. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Match the target helper+wrapper and current specialized helper over exact callsites, exports, arguments, return values and function identity observations. Close together with 90-8.28; local closure does not close 90-9.

### 90-8.R006 — 90-8.14 SettingsSchema exact qualified sites (src/utils/settings/types.ts)

- Status: shape-diagnostic-gap-open; historical: acceptance-domain decision.
- Window: 6; target [2567, 2568]; candidate [2566, 2567]; target-minus-candidate nodes: 1.
- Source: `src/utils/settings/types.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 2567. Current statements: 2566. Reuse the authenticated complete Trial 68 witness correspondence and literal original qualifiers; decide the bounded acceptance obligation without replaying the compiler or applying a general normalization. Owner role: Acceptance owner with independent proof reviewer.
- Inherited completion criterion: For the original SettingsSchema sites,12 complete witnesses and complete shared graph, record the exact accepted proof scope and discharge or explicitly retain its original assumptions under the chosen acceptance criterion. Conditional transfer alone does not close strict AST or whole acceptance. Close together with 90-8.14; local closure does not close 90-9.

### 90-8.R007 — 90-8.23 Undici proxy, dump, WebSocket and EventSource private bindings (node_modules/undici/lib/dispatcher/env-http-proxy-agent.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 7; target [2681, 2682]; candidate [2680, 2681]; target-minus-candidate nodes: 0.
- Source: `node_modules/undici/lib/dispatcher/env-http-proxy-agent.js` (identical-to-verified-89)
- Next: Trial 68 target statements: 2681. Current statements: 2680. Prepare five exact scoped subreceipts in this bounded dependency-family package; do not authorize private-name normalization outside them. This row shares the complete closure criterion with the other rows in 90-8.23. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close five separately enumerated Undici owner/class scopes: env-http-proxy-agent, dump, websocket receiver, websocket and eventsource. Each must preserve brands, all non-private fields, callbacks and initializer/capture graph. Close together with 90-8.23; local closure does not close 90-9.

### 90-8.R008 — 90-8.23 Undici proxy, dump, WebSocket and EventSource private bindings (node_modules/undici/lib/interceptor/dump.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 8; target [2706, 2707]; candidate [2705, 2706]; target-minus-candidate nodes: 0.
- Source: `node_modules/undici/lib/interceptor/dump.js` (identical-to-verified-89)
- Next: Trial 68 target statements: 2706. Current statements: 2705. Prepare five exact scoped subreceipts in this bounded dependency-family package; do not authorize private-name normalization outside them. This row shares the complete closure criterion with the other rows in 90-8.23. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close five separately enumerated Undici owner/class scopes: env-http-proxy-agent, dump, websocket receiver, websocket and eventsource. Each must preserve brands, all non-private fields, callbacks and initializer/capture graph. Close together with 90-8.23; local closure does not close 90-9.

### 90-8.R009 — 90-8.23 Undici proxy, dump, WebSocket and EventSource private bindings (node_modules/undici/lib/web/websocket/receiver.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 9; target [2733, 2734]; candidate [2732, 2733]; target-minus-candidate nodes: 0.
- Source: `node_modules/undici/lib/web/websocket/receiver.js` (identical-to-verified-89)
- Next: Trial 68 target statements: 2733. Current statements: 2732. Prepare five exact scoped subreceipts in this bounded dependency-family package; do not authorize private-name normalization outside them. This row shares the complete closure criterion with the other rows in 90-8.23. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close five separately enumerated Undici owner/class scopes: env-http-proxy-agent, dump, websocket receiver, websocket and eventsource. Each must preserve brands, all non-private fields, callbacks and initializer/capture graph. Close together with 90-8.23; local closure does not close 90-9.

### 90-8.R010 — 90-8.23 Undici proxy, dump, WebSocket and EventSource private bindings (node_modules/undici/lib/web/websocket/websocket.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 10; target [2735, 2736]; candidate [2734, 2735]; target-minus-candidate nodes: 0.
- Source: `node_modules/undici/lib/web/websocket/websocket.js` (identical-to-verified-89)
- Next: Trial 68 target statements: 2735. Current statements: 2734. Prepare five exact scoped subreceipts in this bounded dependency-family package; do not authorize private-name normalization outside them. This row shares the complete closure criterion with the other rows in 90-8.23. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close five separately enumerated Undici owner/class scopes: env-http-proxy-agent, dump, websocket receiver, websocket and eventsource. Each must preserve brands, all non-private fields, callbacks and initializer/capture graph. Close together with 90-8.23; local closure does not close 90-9.

### 90-8.R011 — 90-8.23 Undici proxy, dump, WebSocket and EventSource private bindings (node_modules/undici/lib/web/eventsource/eventsource.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 11; target [2738, 2739]; candidate [2737, 2738]; target-minus-candidate nodes: 0.
- Source: `node_modules/undici/lib/web/eventsource/eventsource.js` (identical-to-verified-89)
- Next: Trial 68 target statements: 2738. Current statements: 2737. Prepare five exact scoped subreceipts in this bounded dependency-family package; do not authorize private-name normalization outside them. This row shares the complete closure criterion with the other rows in 90-8.23. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close five separately enumerated Undici owner/class scopes: env-http-proxy-agent, dump, websocket receiver, websocket and eventsource. Each must preserve brands, all non-private fields, callbacks and initializer/capture graph. Close together with 90-8.23; local closure does not close 90-9.

### 90-8.R012 — 90-8.07 Shared querystring and URI suppliers (node_modules/@smithy/util-stream/node_modules/@smithy/fetch-http-handler/node_modules/@smithy/querystring-builder/dist-cjs/index.js, node_modules/@smithy/util-stream/node_modules/@smithy/fetch-http-handler/node_modules/@smithy/querystring-builder/node_modules/@smithy/util-uri-escape/dist-cjs/index.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 12; target [2791, 2791]; candidate [2790, 2792]; target-minus-candidate nodes: -196.
- Source: `node_modules/@smithy/util-stream/node_modules/@smithy/fetch-http-handler/node_modules/@smithy/querystring-builder/dist-cjs/index.js` (identical-to-verified-89), `node_modules/@smithy/util-stream/node_modules/@smithy/fetch-http-handler/node_modules/@smithy/querystring-builder/node_modules/@smithy/util-uri-escape/dist-cjs/index.js` (identical-to-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 2790, 2791. Trace all three consumers and complete supplier/escape graphs with initialization and identity observations; do not collapse same-shaped factories. This row shares the complete closure criterion with the other rows in 90-8.07. Owner role: Compiler/binding and source-owner proof reviewer. Also tracked under 90-6; same obligation.
- Inherited completion criterion: Resolve target R28 sharing versus current tQ7/Sl7/y_q factories, exact resolver choices, URI escape providers, object/function identity, escape routes and observable initialization sharing. Both inserted wrapper regions and the R28 boundary close together. Close together with 90-8.07; local closure does not close 90-9.

### 90-8.R013 — 90-8.07 Shared querystring and URI suppliers (node_modules/@aws-sdk/util-format-url/node_modules/@smithy/querystring-builder/dist-cjs/index.js, node_modules/@aws-sdk/util-format-url/node_modules/@smithy/querystring-builder/node_modules/@smithy/util-uri-escape/dist-cjs/index.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 13; target [2991, 2991]; candidate [2992, 2994]; target-minus-candidate nodes: -196.
- Source: `node_modules/@aws-sdk/util-format-url/node_modules/@smithy/querystring-builder/dist-cjs/index.js` (identical-to-verified-89), `node_modules/@aws-sdk/util-format-url/node_modules/@smithy/querystring-builder/node_modules/@smithy/util-uri-escape/dist-cjs/index.js` (identical-to-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 2992, 2993. Trace all three consumers and complete supplier/escape graphs with initialization and identity observations; do not collapse same-shaped factories. This row shares the complete closure criterion with the other rows in 90-8.07. Owner role: Compiler/binding and source-owner proof reviewer. Also tracked under 90-6; same obligation.
- Inherited completion criterion: Resolve target R28 sharing versus current tQ7/Sl7/y_q factories, exact resolver choices, URI escape providers, object/function identity, escape routes and observable initialization sharing. Both inserted wrapper regions and the R28 boundary close together. Close together with 90-8.07; local closure does not close 90-9.

### 90-8.R014 — 90-8.15 API client exact spread sites (src/services/api/client.ts)

- Status: shape-diagnostic-gap-open; historical: acceptance-domain decision.
- Window: 14; target [4447, 4448]; candidate [4450, 4451]; target-minus-candidate nodes: -2.
- Source: `src/services/api/client.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 4447. Current statements: 4450. Reuse the authenticated complete Trial 68 witness correspondence and literal original qualifiers; decide the bounded acceptance obligation without replaying the compiler or applying a general normalization. Owner role: Acceptance owner with independent proof reviewer.
- Inherited completion criterion: For the original API client spread sites,88 complete witnesses and complete shared graph, record the exact accepted proof scope and discharge or explicitly retain its original assumptions under the chosen acceptance criterion. Conditional transfer alone does not close strict AST or whole acceptance. Close together with 90-8.15; local closure does not close 90-9.

### 90-8.R015 — 90-8.29 Telemetry client configuration literal (src/services/analytics/datadog.ts)

- Status: shape-diagnostic-gap-open; historical: acceptance-domain decision.
- Window: 15; target [5022, 5023]; candidate [5025, 5026]; target-minus-candidate nodes: 0.
- Source: `src/services/analytics/datadog.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 5022. Current statements: 5025. Confirm the intended configuration identity and build contract, then restore the literal or document a specifically approved scope. Owner role: Acceptance owner with independent proof reviewer.
- Inherited completion criterion: Resolve the exact differing public telemetry client identifier against intended external-build configuration and reachable telemetry behavior. Close together with 90-8.29; local closure does not close 90-9.

### 90-8.R016 — 90-8.30 Shared tool/API limits and file-read constant (src/constants/toolLimits.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 16; target [5043, 5043]; candidate [5046, 5047]; target-minus-candidate nodes: -19.
- Source: `src/constants/toolLimits.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 5046. Join the named constant declarations to their complete consumer graphs; establish whether the three owner fronts are coupled before a coordinated repair. This row shares the complete closure criterion with the other rows in 90-8.30. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Account for every added/missing toolLimits/apiLimits entry and the fileReadState literal-to-capture replacement, including all uses, values, initialization grouping and reachability. Close together with 90-8.30; local closure does not close 90-9.

### 90-8.R017 — 90-8.31 Bidi destructuring syntax (node_modules/bidi-js/dist/bidi.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 17; target [5578, 5579]; candidate [5582, 5583]; target-minus-candidate nodes: 0.
- Source: `node_modules/bidi-js/dist/bidi.js` (identical-to-verified-89)
- Next: Trial 68 target statements: 5578. Current statements: 5582. Produce a two-site, whole-wrapper certificate or exact syntax restoration; retain equal-scope evidence as diagnostic only. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Prove both exact shorthand-flag sites preserve binding/property semantics within the complete vendor graph, under stated observation assumptions. Close together with 90-8.31; local closure does not close 90-9.

### 90-8.R018 — 90-8.32 Settings change-detector callback receiver (src/utils/settings/changeDetector.ts)

- Status: bounded-structural-repair; strict-and-package-closure-open; historical: proof needed.
- Window: None; target [5825, 5826]; candidate [5829, 5830]; target-minus-candidate nodes: 0.
- Source: `src/utils/settings/changeDetector.ts` (changed-from-verified-89)
- Next: Preserve the verified source repair; rebind complete owner/capture evidence to the final build and resolve strict naming, provider and package obligations. Do not repeat the source repair.
- Inherited completion criterion: Establish the exact callback method/provider and receiver this identity, registration and cleanup timing. Close together with 90-8.32; local closure does not close 90-9.

### 90-8.R019 — 90-8.33 Markdown configuration initializer spread (src/utils/markdownConfigLoader.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 18; target [5979, 5980]; candidate [5983, 5984]; target-minus-candidate nodes: -2.
- Source: `src/utils/markdownConfigLoader.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 5979. Current statements: 5983. Inspect the complete markdownConfigLoader initializer and suppliers. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Discharge this exact empty-spread site and initializer order with the actual object/property domain; API/Settings certificates do not apply. Close together with 90-8.33; local closure does not close 90-9.

### 90-8.R020 — 90-8.34 Verification-agent prompt literal (src/tools/AgentTool/built-in/verificationAgent.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 19; target [6671, 6672]; candidate [6675, 6676]; target-minus-candidate nodes: 0.
- Source: `src/tools/AgentTool/built-in/verificationAgent.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 6671. Current statements: 6675. Ground the literal in its source owner and callers, then author one exact target-faithful or explicitly approved prompt package. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Resolve the complete verification-agent literal difference and intended prompt contract, preserving all original text evidence. Close together with 90-8.34; local closure does not close 90-9.

### 90-8.R021 — 90-8.35 Agent JSON-definition spread sites (src/tools/AgentTool/loadAgentsDir.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 20; target [6687, 6688]; candidate [6691, 6692]; target-minus-candidate nodes: -11.
- Source: `src/tools/AgentTool/loadAgentsDir.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 6687. Current statements: 6691. Trace complete loadAgentsDir providers and property-read behavior; do not reuse a generic validation/branch diagnosis. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close the exact logical-and versus conditional object/empty-object spreads and retained target empty spread, with property evaluation order and value domain justified. Close together with 90-8.35; local closure does not close 90-9.

### 90-8.R022 — 90-8.30 Shared tool/API limits and file-read constant (src/constants/apiLimits.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 21; target [6704, 6705]; candidate [6708, 6709]; target-minus-candidate nodes: 6.
- Source: `src/constants/apiLimits.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 6704. Current statements: 6708. Join the named constant declarations to their complete consumer graphs; establish whether the three owner fronts are coupled before a coordinated repair. This row shares the complete closure criterion with the other rows in 90-8.30. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Account for every added/missing toolLimits/apiLimits entry and the fileReadState literal-to-capture replacement, including all uses, values, initialization grouping and reachability. Close together with 90-8.30; local closure does not close 90-9.

### 90-8.R023 — 90-8.36 Image MIME helpers and placement (paired placement/source scope)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 22; target [7004, 7006]; candidate [7008, 7008]; target-minus-candidate nodes: 159.
- Source: Unmapped or target-only; do not invent an owner.
- Next: Trial 68 target statements: 7004, 7005. Current statements: none (target-only deletion). Review both helpers and all consumer/binding evidence as one imageResizer package. This row shares the complete closure criterion with the other rows in 90-8.36. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the displaced target 7004/7005 versus current 7021/7022 helper pair, the complete-body one-node mismatch, suppliers, callers and definition/initialization placement. Close together with 90-8.36; local closure does not close 90-9.

### 90-8.R024 — 90-8.36 Image MIME helpers and placement (src/utils/imageResizer.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 23; target [7019, 7019]; candidate [7021, 7023]; target-minus-candidate nodes: -160.
- Source: `src/utils/imageResizer.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 7021, 7022. Review both helpers and all consumer/binding evidence as one imageResizer package. This row shares the complete closure criterion with the other rows in 90-8.36. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the displaced target 7004/7005 versus current 7021/7022 helper pair, the complete-body one-node mismatch, suppliers, callers and definition/initialization placement. Close together with 90-8.36; local closure does not close 90-9.

### 90-8.R025 — 90-8.37 Native Swift/input and gRPC build-directory locators (node_modules/@ant/computer-use-swift/js/index.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 24; target [7043, 7044]; candidate [7047, 7048]; target-minus-candidate nodes: 0.
- Source: `node_modules/@ant/computer-use-swift/js/index.js` (identical-to-verified-89)
- Next: Trial 68 target statements: 7043. Current statements: 7047. Prove the package-root/native locator contract separately for computer-use-swift, computer-use-input, grpc channelz and grpc orca. This row shares the complete closure criterion with the other rows in 90-8.37. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve each of four exact 2211/2201 embedded-build path differences and actual native module lookup/loading contract; no path normalization. Close together with 90-8.37; local closure does not close 90-9.

### 90-8.R026 — 90-8.37 Native Swift/input and gRPC build-directory locators (node_modules/@ant/computer-use-input/js/index.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 25; target [7156, 7157]; candidate [7160, 7161]; target-minus-candidate nodes: 0.
- Source: `node_modules/@ant/computer-use-input/js/index.js` (identical-to-verified-89)
- Next: Trial 68 target statements: 7156. Current statements: 7160. Prove the package-root/native locator contract separately for computer-use-swift, computer-use-input, grpc channelz and grpc orca. This row shares the complete closure criterion with the other rows in 90-8.37. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve each of four exact 2211/2201 embedded-build path differences and actual native module lookup/loading contract; no path normalization. Close together with 90-8.37; local closure does not close 90-9.

### 90-8.R027 — 90-8.38 Bash parser and AST last-element contract (src/utils/bash/bashParser.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 26; target [7517, 7518]; candidate [7521, 7522]; target-minus-candidate nodes: -1.
- Source: `src/utils/bash/bashParser.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7517. Current statements: 7521. Prepare a complete parser-owner/call-domain proof with per-site controls. A single ordinary-array example is insufficient. This row shares the complete closure criterion with the other rows in 90-8.38. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close every enumerated at(-1) versus indexed length-minus-one site in bashParser, bash/ast and commandSemantics, all other uncapped fields and the precise array/intrinsic/prototype/input domains. Close together with 90-8.38; local closure does not close 90-9.

### 90-8.R028 — 90-8.38 Bash parser and AST last-element contract (src/utils/bash/bashParser.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 27; target [7519, 7523]; candidate [7523, 7527]; target-minus-candidate nodes: -10.
- Source: `src/utils/bash/bashParser.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7519, 7520, 7521, 7522. Current statements: 7523, 7524, 7525, 7526. Prepare a complete parser-owner/call-domain proof with per-site controls. A single ordinary-array example is insufficient. This row shares the complete closure criterion with the other rows in 90-8.38. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close every enumerated at(-1) versus indexed length-minus-one site in bashParser, bash/ast and commandSemantics, all other uncapped fields and the precise array/intrinsic/prototype/input domains. Close together with 90-8.38; local closure does not close 90-9.

### 90-8.R029 — 90-8.38 Bash parser and AST last-element contract (src/utils/bash/bashParser.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 28; target [7527, 7528]; candidate [7531, 7532]; target-minus-candidate nodes: -1.
- Source: `src/utils/bash/bashParser.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7527. Current statements: 7531. Prepare a complete parser-owner/call-domain proof with per-site controls. A single ordinary-array example is insufficient. This row shares the complete closure criterion with the other rows in 90-8.38. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close every enumerated at(-1) versus indexed length-minus-one site in bashParser, bash/ast and commandSemantics, all other uncapped fields and the precise array/intrinsic/prototype/input domains. Close together with 90-8.38; local closure does not close 90-9.

### 90-8.R030 — 90-8.38 Bash parser and AST last-element contract (src/utils/bash/bashParser.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 29; target [7532, 7533]; candidate [7536, 7537]; target-minus-candidate nodes: -1.
- Source: `src/utils/bash/bashParser.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7532. Current statements: 7536. Prepare a complete parser-owner/call-domain proof with per-site controls. A single ordinary-array example is insufficient. This row shares the complete closure criterion with the other rows in 90-8.38. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close every enumerated at(-1) versus indexed length-minus-one site in bashParser, bash/ast and commandSemantics, all other uncapped fields and the precise array/intrinsic/prototype/input domains. Close together with 90-8.38; local closure does not close 90-9.

### 90-8.R031 — 90-8.38 Bash parser and AST last-element contract (src/utils/bash/bashParser.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 30; target [7538, 7540]; candidate [7542, 7544]; target-minus-candidate nodes: -2.
- Source: `src/utils/bash/bashParser.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7538, 7539. Current statements: 7542, 7543. Prepare a complete parser-owner/call-domain proof with per-site controls. A single ordinary-array example is insufficient. This row shares the complete closure criterion with the other rows in 90-8.38. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close every enumerated at(-1) versus indexed length-minus-one site in bashParser, bash/ast and commandSemantics, all other uncapped fields and the precise array/intrinsic/prototype/input domains. Close together with 90-8.38; local closure does not close 90-9.

### 90-8.R032 — 90-8.38 Bash parser and AST last-element contract (src/utils/bash/bashParser.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 31; target [7542, 7548]; candidate [7546, 7552]; target-minus-candidate nodes: -10.
- Source: `src/utils/bash/bashParser.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7542, 7543, 7544, 7545, 7546, 7547. Current statements: 7546, 7547, 7548, 7549, 7550, 7551. Prepare a complete parser-owner/call-domain proof with per-site controls. A single ordinary-array example is insufficient. This row shares the complete closure criterion with the other rows in 90-8.38. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close every enumerated at(-1) versus indexed length-minus-one site in bashParser, bash/ast and commandSemantics, all other uncapped fields and the precise array/intrinsic/prototype/input domains. Close together with 90-8.38; local closure does not close 90-9.

### 90-8.R033 — 90-8.38 Bash parser and AST last-element contract (src/utils/bash/bashParser.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 32; target [7550, 7553]; candidate [7554, 7557]; target-minus-candidate nodes: -3.
- Source: `src/utils/bash/bashParser.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7550, 7551, 7552. Current statements: 7554, 7555, 7556. Prepare a complete parser-owner/call-domain proof with per-site controls. A single ordinary-array example is insufficient. This row shares the complete closure criterion with the other rows in 90-8.38. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close every enumerated at(-1) versus indexed length-minus-one site in bashParser, bash/ast and commandSemantics, all other uncapped fields and the precise array/intrinsic/prototype/input domains. Close together with 90-8.38; local closure does not close 90-9.

### 90-8.R034 — 90-8.38 Bash parser and AST last-element contract (src/utils/bash/bashParser.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 33; target [7559, 7560]; candidate [7563, 7564]; target-minus-candidate nodes: -1.
- Source: `src/utils/bash/bashParser.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7559. Current statements: 7563. Prepare a complete parser-owner/call-domain proof with per-site controls. A single ordinary-array example is insufficient. This row shares the complete closure criterion with the other rows in 90-8.38. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close every enumerated at(-1) versus indexed length-minus-one site in bashParser, bash/ast and commandSemantics, all other uncapped fields and the precise array/intrinsic/prototype/input domains. Close together with 90-8.38; local closure does not close 90-9.

### 90-8.R035 — 90-8.38 Bash parser and AST last-element contract (src/utils/bash/ast.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 34; target [7592, 7593]; candidate [7596, 7597]; target-minus-candidate nodes: -1.
- Source: `src/utils/bash/ast.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7592. Current statements: 7596. Prepare a complete parser-owner/call-domain proof with per-site controls. A single ordinary-array example is insufficient. This row shares the complete closure criterion with the other rows in 90-8.38. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close every enumerated at(-1) versus indexed length-minus-one site in bashParser, bash/ast and commandSemantics, all other uncapped fields and the precise array/intrinsic/prototype/input domains. Close together with 90-8.38; local closure does not close 90-9.

### 90-8.R036 — 90-8.39 Shell parser success/tokens interface (src/utils/bash/shellQuote.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 35; target [7611, 7611]; candidate [7615, 7618]; target-minus-candidate nodes: -83.
- Source: `src/utils/bash/shellQuote.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 7615, 7616, 7617. Trace one complete shell-parser interface from supplier through consumers, error paths and initialization before a coherent repair. This row shares the complete closure criterion with the other rows in 90-8.39. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the shellQuote result-wrapper/namespace/lazy initializer, direct-token versus success/tokens contracts in argumentSubstitution/bashPermissions, cached parser dependency and all affected declarations/callers. Close together with 90-8.39; local closure does not close 90-9.

### 90-8.R037 — 90-8.40 VSCode MCP state gates and constants (src/services/mcp/vscodeSdkMcp.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 36; target [7647, 7649]; candidate [7654, 7655]; target-minus-candidate nodes: 18.
- Source: `src/services/mcp/vscodeSdkMcp.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 7647, 7648. Current statements: 7654. Inspect complete vscodeSdkMcp state producers and serialized consumers. This row shares the complete closure criterion with the other rows in 90-8.40. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close constant placement/getter syntax and the unconditional versus undefined-guarded tengu_auto_mode_state property, including object shape, serialization and separately read provider values. Close together with 90-8.40; local closure does not close 90-9.

### 90-8.R038 — 90-8.40 VSCode MCP state gates and constants (src/services/mcp/vscodeSdkMcp.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 37; target [7650, 7651]; candidate [7656, 7657]; target-minus-candidate nodes: -8.
- Source: `src/services/mcp/vscodeSdkMcp.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 7650. Current statements: 7656. Inspect complete vscodeSdkMcp state producers and serialized consumers. This row shares the complete closure criterion with the other rows in 90-8.40. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close constant placement/getter syntax and the unconditional versus undefined-guarded tengu_auto_mode_state property, including object shape, serialization and separately read provider values. Close together with 90-8.40; local closure does not close 90-9.

### 90-8.R039 — 90-8.41 Bash command-safety helper and optional parser (paired placement/source scope)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 38; target [7743, 7744]; candidate [7749, 7749]; target-minus-candidate nodes: 226.
- Source: Unmapped or target-only; do not invent an owner.
- Next: Trial 68 target statements: 7743. Current statements: none (target-only deletion). Join readOnlyValidation to its exact parser contract and callers; preserve both placement sides. This row shares the complete closure criterion with the other rows in 90-8.41. Owner role: Compiler/binding and source-owner proof reviewer. Depends on 90-8.39.
- Inherited completion criterion: Resolve command-safety helper displacement and body mismatch, optional versus direct parser call, nullability/failure behavior, providers and complete initializer graph. Close together with 90-8.41; local closure does not close 90-9.

### 90-8.R040 — 90-8.41 Bash command-safety helper and optional parser (src/tools/BashTool/readOnlyValidation.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 39; target [7745, 7745]; candidate [7750, 7751]; target-minus-candidate nodes: -227.
- Source: `src/tools/BashTool/readOnlyValidation.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 7750. Join readOnlyValidation to its exact parser contract and callers; preserve both placement sides. This row shares the complete closure criterion with the other rows in 90-8.41. Owner role: Compiler/binding and source-owner proof reviewer. Depends on 90-8.39.
- Inherited completion criterion: Resolve command-safety helper displacement and body mismatch, optional versus direct parser call, nullability/failure behavior, providers and complete initializer graph. Close together with 90-8.41; local closure does not close 90-9.

### 90-8.R041 — 90-8.41 Bash command-safety helper and optional parser (src/tools/BashTool/readOnlyValidation.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 40; target [7750, 7751]; candidate [7756, 7757]; target-minus-candidate nodes: -1.
- Source: `src/tools/BashTool/readOnlyValidation.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7750. Current statements: 7756. Join readOnlyValidation to its exact parser contract and callers; preserve both placement sides. This row shares the complete closure criterion with the other rows in 90-8.41. Owner role: Compiler/binding and source-owner proof reviewer. Depends on 90-8.39.
- Inherited completion criterion: Resolve command-safety helper displacement and body mismatch, optional versus direct parser call, nullability/failure behavior, providers and complete initializer graph. Close together with 90-8.41; local closure does not close 90-9.

### 90-8.R042 — 90-8.41 Bash command-safety helper and optional parser (src/tools/BashTool/readOnlyValidation.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 41; target [7752, 7753]; candidate [7758, 7759]; target-minus-candidate nodes: -1.
- Source: `src/tools/BashTool/readOnlyValidation.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7752. Current statements: 7758. Join readOnlyValidation to its exact parser contract and callers; preserve both placement sides. This row shares the complete closure criterion with the other rows in 90-8.41. Owner role: Compiler/binding and source-owner proof reviewer. Depends on 90-8.39.
- Inherited completion criterion: Resolve command-safety helper displacement and body mismatch, optional versus direct parser call, nullability/failure behavior, providers and complete initializer graph. Close together with 90-8.41; local closure does not close 90-9.

### 90-8.R043 — 90-8.06 Deferred-resume definition placement (src/utils/queryHelpers.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 42; target [7766, 7766]; candidate [7772, 7773]; target-minus-candidate nodes: -209.
- Source: `src/utils/queryHelpers.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 7772. Establish when the generator binding becomes observable and how callers initialize relative to its two positions; reuse the authenticated body evidence. This row shares the complete closure criterion with the other rows in 90-8.06. Owner role: Compiler/binding and source-owner proof reviewer. Also tracked under 90-5; same obligation.
- Inherited completion criterion: Prove only movement/definition placement of the already repaired target 7768/current 7772 generator. Preserve the exact Trial 64 complete body and 23-statement joined graph and all exclusions. Close together with 90-8.06; local closure does not close 90-9.

### 90-8.R044 — 90-8.06 Deferred-resume definition placement (paired placement/source scope)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 43; target [7768, 7769]; candidate [7775, 7775]; target-minus-candidate nodes: 209.
- Source: Unmapped or target-only; do not invent an owner.
- Next: Trial 68 target statements: 7768. Current statements: none (target-only deletion). Establish when the generator binding becomes observable and how callers initialize relative to its two positions; reuse the authenticated body evidence. This row shares the complete closure criterion with the other rows in 90-8.06. Owner role: Compiler/binding and source-owner proof reviewer. Also tracked under 90-5; same obligation.
- Inherited completion criterion: Prove only movement/definition placement of the already repaired target 7768/current 7772 generator. Preserve the exact Trial 64 complete body and 23-statement joined graph and all exclusions. Close together with 90-8.06; local closure does not close 90-9.

### 90-8.R045 — 90-8.16 readCronTasks exact spread sites (src/utils/cronTasks.ts)

- Status: shape-diagnostic-gap-open; historical: acceptance-domain decision.
- Window: 44; target [7854, 7855]; candidate [7860, 7861]; target-minus-candidate nodes: -3.
- Source: `src/utils/cronTasks.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7854. Current statements: 7860. Reuse the authenticated complete Trial 68 witness correspondence and literal original qualifiers; decide the bounded acceptance obligation without replaying the compiler or applying a general normalization. Owner role: Acceptance owner with independent proof reviewer.
- Inherited completion criterion: For the three original readCronTasks sites,11 witnesses and 750-node graph, retaining changing/throwing getter and read-order coverage and only the original IsHTMLDDA exclusion, record the exact accepted proof scope and discharge or explicitly retain its original assumptions under the chosen acceptance criterion. Conditional transfer alone does not close strict AST or whole acceptance. Close together with 90-8.16; local closure does not close 90-9.

### 90-8.R046 — 90-8.42 Scheduled-task creator spread sites (src/utils/cronTasks.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 45; target [7857, 7858]; candidate [7863, 7864]; target-minus-candidate nodes: -2.
- Source: `src/utils/cronTasks.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 7857. Current statements: 7863. Prepare its own exact spread proof; the readCronTasks certificate does not cover these sites. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close recurring/agentId conditional spreads with exact property-read, getter and value-domain behavior in the complete creator. Close together with 90-8.42; local closure does not close 90-9.

### 90-8.R047 — 90-8.43 MCP output truncation helper (src/utils/mcpOutputStorage.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 46; target [8352, 8354]; candidate [8358, 8359]; target-minus-candidate nodes: 3.
- Source: `src/utils/mcpOutputStorage.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 8352, 8353. Current statements: 8358. Ground the whole mcpOutputStorage owner and target helper before a complete source plan. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Resolve the split/inlined helper, exact truncation-message text, arguments, callers and output-domain behavior. Close together with 90-8.43; local closure does not close 90-9.

### 90-8.R048 — 90-8.44 Classifier prompts and initialization (physical source owner unresolved)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 47; target [8758, 8760]; candidate [8763, 8765]; target-minus-candidate nodes: 0.
- Source: Unmapped or target-only; do not invent an owner.
- Next: Trial 68 target statements: 8758, 8759. Current statements: 8763, 8764. Resolve source attribution explicitly from producer/caller evidence; do not invent an owner from neighboring map segments. Physical source attribution for the unmapped literal is still unresolved. This row shares the complete closure criterion with the other rows in 90-8.44. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Attribute both unmapped target/current classifier prompt literals and target-only initializer, then close their complete agentToolUtils consumer/dependency graph and initialization effects. Close together with 90-8.44; local closure does not close 90-9.

### 90-8.R049 — 90-8.44 Classifier prompts and initialization (paired placement/source scope)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 48; target [8801, 8802]; candidate [8806, 8806]; target-minus-candidate nodes: 16.
- Source: Unmapped or target-only; do not invent an owner.
- Next: Trial 68 target statements: 8801. Current statements: none (target-only deletion). Resolve source attribution explicitly from producer/caller evidence; do not invent an owner from neighboring map segments. This row shares the complete closure criterion with the other rows in 90-8.44. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Attribute both unmapped target/current classifier prompt literals and target-only initializer, then close their complete agentToolUtils consumer/dependency graph and initialization effects. Close together with 90-8.44; local closure does not close 90-9.

### 90-8.R050 — 90-8.44 Classifier prompts and initialization (src/tools/AgentTool/agentToolUtils.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 49; target [8812, 8813]; candidate [8816, 8817]; target-minus-candidate nodes: 3.
- Source: `src/tools/AgentTool/agentToolUtils.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 8812. Current statements: 8816. Resolve source attribution explicitly from producer/caller evidence; do not invent an owner from neighboring map segments. This row shares the complete closure criterion with the other rows in 90-8.44. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Attribute both unmapped target/current classifier prompt literals and target-only initializer, then close their complete agentToolUtils consumer/dependency graph and initialization effects. Close together with 90-8.44; local closure does not close 90-9.

### 90-8.R051 — 90-8.45 Remote managed-settings override interface (src/services/remoteManagedSettings/index.ts)

- Status: bounded-structural-repair; strict-and-package-closure-open; historical: proof needed.
- Window: None; target [9023, 9026]; candidate [9027, 9030]; target-minus-candidate nodes: 0.
- Source: `src/services/remoteManagedSettings/index.ts` (identical-to-verified-89)
- Next: Preserve the verified source repair; rebind complete owner/capture evidence to the final build and resolve strict naming, provider and package obligations. Do not repeat the source repair.
- Inherited completion criterion: Resolve override guard differences with the actual current undefined-stub provider and all allowed future/provider values, including initialization and returned settings shape. Close together with 90-8.45; local closure does not close 90-9.

### 90-8.R052 — 90-8.37 Native Swift/input and gRPC build-directory locators (node_modules/@grpc/grpc-js/build/src/channelz.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 50; target [9283, 9284]; candidate [9287, 9288]; target-minus-candidate nodes: 0.
- Source: `node_modules/@grpc/grpc-js/build/src/channelz.js` (identical-to-verified-89)
- Next: Trial 68 target statements: 9283. Current statements: 9287. Prove the package-root/native locator contract separately for computer-use-swift, computer-use-input, grpc channelz and grpc orca. This row shares the complete closure criterion with the other rows in 90-8.37. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve each of four exact 2211/2201 embedded-build path differences and actual native module lookup/loading contract; no path normalization. Close together with 90-8.37; local closure does not close 90-9.

### 90-8.R053 — 90-8.37 Native Swift/input and gRPC build-directory locators (node_modules/@grpc/grpc-js/build/src/orca.js)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 51; target [9309, 9310]; candidate [9313, 9314]; target-minus-candidate nodes: 0.
- Source: `node_modules/@grpc/grpc-js/build/src/orca.js` (identical-to-verified-89)
- Next: Trial 68 target statements: 9309. Current statements: 9313. Prove the package-root/native locator contract separately for computer-use-swift, computer-use-input, grpc channelz and grpc orca. This row shares the complete closure criterion with the other rows in 90-8.37. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve each of four exact 2211/2201 embedded-build path differences and actual native module lookup/loading contract; no path normalization. Close together with 90-8.37; local closure does not close 90-9.

### 90-8.R054 — 90-8.26 Task snapshot and authentication class (src/hooks/useTasksV2.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 52; target [9679, 9680]; candidate [9683, 9684]; target-minus-candidate nodes: 0.
- Source: `src/hooks/useTasksV2.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 9679. Current statements: 9683. Trace class construction and snapshot/auth-state users before an exact-class certificate. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close the complete useTasksV2 snapshot/auth-state class private bindings, captures and initialization; TaskOutput scope does not apply. Close together with 90-8.26; local closure does not close 90-9.

### 90-8.R055 — 90-8.46 SDK core schema declarations (src/entrypoints/sdk/coreSchemas.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 53; target [9737, 9739]; candidate [9741, 9743]; target-minus-candidate nodes: -86.
- Source: `src/entrypoints/sdk/coreSchemas.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 9737, 9738. Current statements: 9741, 9742. Build a full schema field and provider census before deciding a repair. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Reconcile every added field and structural/initializer difference in both complete coreSchemas statements, with constructor/provider/export identity. Close together with 90-8.46; local closure does not close 90-9.

### 90-8.R056 — 90-8.17 In-process runner exact spread frontier (src/utils/swarm/inProcessRunner.ts)

- Status: shape-diagnostic-gap-open; historical: acceptance-domain decision.
- Window: 54; target [9826, 9827]; candidate [9830, 9831]; target-minus-candidate nodes: 0.
- Source: `src/utils/swarm/inProcessRunner.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 9826. Current statements: 9830. Reuse the authenticated complete Trial 68 witness correspondence and literal original qualifiers; decide the bounded acceptance obligation without replaying the compiler or applying a general normalization. Owner role: Acceptance owner with independent proof reviewer.
- Inherited completion criterion: For the already repaired complete runner plus 22 direct state/provider declarations and 2609-node graph, with only the two original fixed spread sites qualified, record the exact accepted proof scope and discharge or explicitly retain its original assumptions under the chosen acceptance criterion. Conditional transfer alone does not close strict AST or whole acceptance. Close together with 90-8.17; local closure does not close 90-9.

### 90-8.R057 — 90-8.47 Rate-limit component and initialization (src/components/messages/RateLimitMessage.tsx)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 55; target [10054, 10055]; candidate [10058, 10059]; target-minus-candidate nodes: 35.
- Source: `src/components/messages/RateLimitMessage.tsx` (identical-to-verified-89)
- Next: Trial 68 target statements: 10054. Current statements: 10058. Diagnose the whole mapped component and callback/provider graph together. This row shares the complete closure criterion with the other rows in 90-8.47. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Close the complete RateLimitMessage body, memo-slot/branch changes, captures and its initializer dependency order. Close together with 90-8.47; local closure does not close 90-9.

### 90-8.R058 — 90-8.47 Rate-limit component and initialization (src/components/messages/RateLimitMessage.tsx)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 56; target [10056, 10057]; candidate [10060, 10061]; target-minus-candidate nodes: 3.
- Source: `src/components/messages/RateLimitMessage.tsx` (identical-to-verified-89)
- Next: Trial 68 target statements: 10056. Current statements: 10060. Diagnose the whole mapped component and callback/provider graph together. This row shares the complete closure criterion with the other rows in 90-8.47. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Close the complete RateLimitMessage body, memo-slot/branch changes, captures and its initializer dependency order. Close together with 90-8.47; local closure does not close 90-9.

### 90-8.R059 — 90-8.39 Shell parser success/tokens interface (src/utils/argumentSubstitution.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 57; target [10663, 10664]; candidate [10667, 10668]; target-minus-candidate nodes: -17.
- Source: `src/utils/argumentSubstitution.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 10663. Current statements: 10667. Trace one complete shell-parser interface from supplier through consumers, error paths and initialization before a coherent repair. This row shares the complete closure criterion with the other rows in 90-8.39. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the shellQuote result-wrapper/namespace/lazy initializer, direct-token versus success/tokens contracts in argumentSubstitution/bashPermissions, cached parser dependency and all affected declarations/callers. Close together with 90-8.39; local closure does not close 90-9.

### 90-8.R060 — 90-8.18 TaskOutput exact private-class scope (src/utils/task/TaskOutput.ts)

- Status: shape-diagnostic-gap-open; historical: acceptance-domain decision.
- Window: 58; target [10692, 10693]; candidate [10696, 10697]; target-minus-candidate nodes: 0.
- Source: `src/utils/task/TaskOutput.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 10692. Current statements: 10696. Reuse the authenticated complete Trial 68 witness correspondence and literal original qualifiers; decide the bounded acceptance obligation without replaying the compiler or applying a general normalization. Owner role: Acceptance owner with independent proof reviewer.
- Inherited completion criterion: For the exact TaskOutput class-scoped private-name bijection and three original witnesses, with ordinary capture and reflection limits intact, record the exact accepted proof scope and discharge or explicitly retain its original assumptions under the chosen acceptance criterion. Conditional transfer alone does not close strict AST or whole acceptance. Close together with 90-8.18; local closure does not close 90-9.

### 90-8.R061 — 90-8.48 PowerShell common-parameter initialization (src/tools/PowerShellTool/commonParameters.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 59; target [10846, 10847]; candidate [10850, 10851]; target-minus-candidate nodes: 2.
- Source: `src/tools/PowerShellTool/commonParameters.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 10846. Current statements: 10850. Construct a fixed initializer graph/order proof; no general comma/statement regrouping rule. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Prove exact ordered effects and binding identity for equal-looking values with differing sequence/statement grouping. Close together with 90-8.48; local closure does not close 90-9.

### 90-8.R062 — 90-8.49 PowerShell tool initializer (src/tools/PowerShellTool/PowerShellTool.tsx)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 60; target [10966, 10967]; candidate [10970, 10971]; target-minus-candidate nodes: 7.
- Source: `src/tools/PowerShellTool/PowerShellTool.tsx` (identical-to-verified-89)
- Next: Trial 68 target statements: 10966. Current statements: 10970. Classify the uncapped initializer fields and suppliers; preserve prior helper receipts. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.48.
- Inherited completion criterion: Resolve every remaining complete PowerShellTool initializer difference beyond repaired helper scopes and all concrete provider/order effects. Close together with 90-8.49; local closure does not close 90-9.

### 90-8.R063 — 90-8.50 WebSearch tool schema and initialization (src/tools/WebSearchTool/WebSearchTool.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 61; target [11419, 11420]; candidate [11423, 11424]; target-minus-candidate nodes: 4.
- Source: `src/tools/WebSearchTool/WebSearchTool.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 11419. Current statements: 11423. Trace exact schema suppliers and tool consumers before a whole-owner repair. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Reconcile complete WebSearch schema fields, constructor/provider identity and initialization ordering. Close together with 90-8.50; local closure does not close 90-9.

### 90-8.R064 — 90-8.51 Local main-session task initialization (src/tasks/LocalMainSessionTask.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 62; target [11706, 11707]; candidate [11710, 11711]; target-minus-candidate nodes: 3.
- Source: `src/tasks/LocalMainSessionTask.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 11706. Current statements: 11710. Trace each added/omitted dependency through direct initialization and reachable effects. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Discharge the differing initializer dependency list and all observable provider effects for LocalMainSessionTask. Close together with 90-8.51; local closure does not close 90-9.

### 90-8.R065 — 90-8.52 Tool registry and dynamic-loader exports (src/tools.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 63; target [11741, 11742]; candidate [11745, 11746]; target-minus-candidate nodes: 11.
- Source: `src/tools.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 11741. Current statements: 11745. Build the complete registry/loader producer and consumer graph; index order alone cannot establish runtime order. This row shares the complete closure criterion with the other rows in 90-8.52. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Resolve all registry syntax/entries and loader declaration/export grouping with actual spread-produced order, identity and initialization. Close together with 90-8.52; local closure does not close 90-9.

### 90-8.R066 — 90-8.52 Tool registry and dynamic-loader exports (src/tools.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 64; target [11744, 11745]; candidate [11748, 11749]; target-minus-candidate nodes: 3.
- Source: `src/tools.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 11744. Current statements: 11748. Build the complete registry/loader producer and consumer graph; index order alone cannot establish runtime order. This row shares the complete closure criterion with the other rows in 90-8.52. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Resolve all registry syntax/entries and loader declaration/export grouping with actual spread-produced order, identity and initialization. Close together with 90-8.52; local closure does not close 90-9.

### 90-8.R067 — 90-8.38 Bash parser and AST last-element contract (src/tools/BashTool/commandSemantics.ts)

- Status: bounded-structural-repair; strict-and-package-closure-open; historical: proof needed.
- Window: None; target [11868, 11869]; candidate [11872, 11873]; target-minus-candidate nodes: 0.
- Source: `src/tools/BashTool/commandSemantics.ts` (changed-from-verified-89)
- Next: Preserve the verified source repair; rebind complete owner/capture evidence to the final build and resolve strict naming, provider and package obligations. Do not repeat the source repair.
- Inherited completion criterion: Close every enumerated at(-1) versus indexed length-minus-one site in bashParser, bash/ast and commandSemantics, all other uncapped fields and the precise array/intrinsic/prototype/input domains. Close together with 90-8.38; local closure does not close 90-9.

### 90-8.R068 — 90-8.30 Shared tool/API limits and file-read constant (src/tools/BashTool/fileReadState.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 65; target [11875, 11877]; candidate [11879, 11881]; target-minus-candidate nodes: -3.
- Source: `src/tools/BashTool/fileReadState.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 11875, 11876. Current statements: 11879, 11880. Join the named constant declarations to their complete consumer graphs; establish whether the three owner fronts are coupled before a coordinated repair. This row shares the complete closure criterion with the other rows in 90-8.30. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Account for every added/missing toolLimits/apiLimits entry and the fileReadState literal-to-capture replacement, including all uses, values, initialization grouping and reachability. Close together with 90-8.30; local closure does not close 90-9.

### 90-8.R069 — 90-8.53 Team-memory filesystem traversal and errors (src/services/teamMemorySync/index.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 66; target [11885, 11885]; candidate [11889, 11890]; target-minus-candidate nodes: -19.
- Source: `src/services/teamMemorySync/index.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 11889. Review helper identity, exact error domains and traversal consumers as one teamMemorySync package. This row shares the complete closure criterion with the other rows in 90-8.53. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Resolve current-only errno helper plus both complete traversal/read function error/branch contracts with native filesystem providers. Close together with 90-8.53; local closure does not close 90-9.

### 90-8.R070 — 90-8.53 Team-memory filesystem traversal and errors (src/services/teamMemorySync/index.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 67; target [11893, 11895]; candidate [11898, 11900]; target-minus-candidate nodes: -6.
- Source: `src/services/teamMemorySync/index.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 11893, 11894. Current statements: 11898, 11899. Review helper identity, exact error domains and traversal consumers as one teamMemorySync package. This row shares the complete closure criterion with the other rows in 90-8.53. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Resolve current-only errno helper plus both complete traversal/read function error/branch contracts with native filesystem providers. Close together with 90-8.53; local closure does not close 90-9.

### 90-8.R071 — 90-8.54 BashTool initializer (src/tools/BashTool/BashTool.tsx)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 68; target [11958, 11959]; candidate [11963, 11964]; target-minus-candidate nodes: 0.
- Source: `src/tools/BashTool/BashTool.tsx` (changed-from-verified-89)
- Next: Trial 68 target statements: 11958. Current statements: 11963. Classify the complete initializer against concrete supplier contracts before a coordinated tool-level change. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.39, 90-8.41.
- Inherited completion criterion: Close all complete BashTool initializer structure, providers and order outside already repaired helper scopes. Close together with 90-8.54; local closure does not close 90-9.

### 90-8.R072 — 90-8.39 Shell parser success/tokens interface (src/utils/bash/ParsedCommand.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 69; target [11976, 11977]; candidate [11981, 11982]; target-minus-candidate nodes: -3.
- Source: `src/utils/bash/ParsedCommand.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 11976. Current statements: 11981. Trace one complete shell-parser interface from supplier through consumers, error paths and initialization before a coherent repair. This row shares the complete closure criterion with the other rows in 90-8.39. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the shellQuote result-wrapper/namespace/lazy initializer, direct-token versus success/tokens contracts in argumentSubstitution/bashPermissions, cached parser dependency and all affected declarations/callers. Close together with 90-8.39; local closure does not close 90-9.

### 90-8.R073 — 90-8.55 Bash permission newline-prefix helper (src/tools/BashTool/bashPermissions.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 70; target [11990, 11991]; candidate [11995, 11996]; target-minus-candidate nodes: -5.
- Source: `src/tools/BashTool/bashPermissions.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 11990. Current statements: 11995. Trace bashPermissions prefix producer and callers with the string helper contract. Owner role: Compiler/binding and source-owner proof reviewer. Depends on 90-8.28.
- Inherited completion criterion: Resolve newline extraction/inlining over exact arguments, helper identity and all permission callsites. Close together with 90-8.55; local closure does not close 90-9.

### 90-8.R074 — 90-8.39 Shell parser success/tokens interface (src/tools/BashTool/bashPermissions.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 71; target [12007, 12009]; candidate [12012, 12014]; target-minus-candidate nodes: -53.
- Source: `src/tools/BashTool/bashPermissions.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12007, 12008. Current statements: 12012, 12013. Trace one complete shell-parser interface from supplier through consumers, error paths and initialization before a coherent repair. This row shares the complete closure criterion with the other rows in 90-8.39. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the shellQuote result-wrapper/namespace/lazy initializer, direct-token versus success/tokens contracts in argumentSubstitution/bashPermissions, cached parser dependency and all affected declarations/callers. Close together with 90-8.39; local closure does not close 90-9.

### 90-8.R075 — 90-8.39 Shell parser success/tokens interface (src/tools/BashTool/bashPermissions.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 72; target [12010, 12012]; candidate [12015, 12017]; target-minus-candidate nodes: -9.
- Source: `src/tools/BashTool/bashPermissions.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12010, 12011. Current statements: 12015, 12016. Trace one complete shell-parser interface from supplier through consumers, error paths and initialization before a coherent repair. This row shares the complete closure criterion with the other rows in 90-8.39. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the shellQuote result-wrapper/namespace/lazy initializer, direct-token versus success/tokens contracts in argumentSubstitution/bashPermissions, cached parser dependency and all affected declarations/callers. Close together with 90-8.39; local closure does not close 90-9.

### 90-8.R076 — 90-8.56 Tool permission generators and state (src/services/tools/toolHooks.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 73; target [12033, 12035]; candidate [12038, 12040]; target-minus-candidate nodes: -4.
- Source: `src/services/tools/toolHooks.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12033, 12034. Current statements: 12038, 12039. Diagnose all uncapped fields with concrete permission/provider/caller contracts. This row shares the complete closure criterion with the other rows in 90-8.56. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.39, 90-8.13.
- Inherited completion criterion: Close all three complete generators, target 12033, 12034 and 12036 / current 12038, 12039 and 12041, and their shared state/branch structure beyond repaired parser sites, including callback identity and failure/reentry behavior. Close together with 90-8.56; local closure does not close 90-9.

### 90-8.R077 — 90-8.56 Tool permission generators and state (src/services/tools/toolHooks.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 74; target [12036, 12037]; candidate [12041, 12042]; target-minus-candidate nodes: 3.
- Source: `src/services/tools/toolHooks.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12036. Current statements: 12041. Diagnose all uncapped fields with concrete permission/provider/caller contracts. This row shares the complete closure criterion with the other rows in 90-8.56. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.39, 90-8.13.
- Inherited completion criterion: Close all three complete generators, target 12033, 12034 and 12036 / current 12038, 12039 and 12041, and their shared state/branch structure beyond repaired parser sites, including callback identity and failure/reentry behavior. Close together with 90-8.56; local closure does not close 90-9.

### 90-8.R078 — 90-8.57 Tool availability helper placement (paired placement/source scope)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 75; target [12041, 12042]; candidate [12046, 12046]; target-minus-candidate nodes: 39.
- Source: Unmapped or target-only; do not invent an owner.
- Next: Trial 68 target statements: 12041. Current statements: none (target-only deletion). Trace the complete availability helper and callers; same-shaped bodies do not prove movement safety. This row shares the complete closure criterion with the other rows in 90-8.57. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve target 12041/current 12050 helper identity, suppliers, all uses and definition/initialization movement. Close together with 90-8.57; local closure does not close 90-9.

### 90-8.R079 — 90-8.57 Tool availability helper placement (src/services/tools/toolExecution.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 76; target [12046, 12046]; candidate [12050, 12051]; target-minus-candidate nodes: -39.
- Source: `src/services/tools/toolExecution.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 12050. Trace the complete availability helper and callers; same-shaped bodies do not prove movement safety. This row shares the complete closure criterion with the other rows in 90-8.57. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve target 12041/current 12050 helper identity, suppliers, all uses and definition/initialization movement. Close together with 90-8.57; local closure does not close 90-9.

### 90-8.R080 — 90-8.58 Query stop-hook call and initializer (src/query/stopHooks.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 77; target [12115, 12116]; candidate [12120, 12121]; target-minus-candidate nodes: -2.
- Source: `src/query/stopHooks.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12115. Current statements: 12120. Inspect stopHooks suppliers, argument production and initialization/reentry order. This row shares the complete closure criterion with the other rows in 90-8.58. Owner role: Compiler/binding and source-owner proof reviewer. Depends on 90-8.03.
- Inherited completion criterion: Reconcile exact member versus spread/array argument semantics and initializer dependencies with the complete generator/caller contract. Close together with 90-8.58; local closure does not close 90-9.

### 90-8.R081 — 90-8.58 Query stop-hook call and initializer (src/query/stopHooks.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 78; target [12117, 12118]; candidate [12122, 12123]; target-minus-candidate nodes: 9.
- Source: `src/query/stopHooks.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12117. Current statements: 12122. Inspect stopHooks suppliers, argument production and initialization/reentry order. This row shares the complete closure criterion with the other rows in 90-8.58. Owner role: Compiler/binding and source-owner proof reviewer. Depends on 90-8.03.
- Inherited completion criterion: Reconcile exact member versus spread/array argument semantics and initializer dependencies with the complete generator/caller contract. Close together with 90-8.58; local closure does not close 90-9.

### 90-8.R082 — 90-8.03 Query lazy initialization, reentry and failure (src/query.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 79; target [12132, 12133]; candidate [12137, 12138]; target-minus-candidate nodes: 6.
- Source: `src/query.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12132. Current statements: 12137. Trace the named lazy wrappers and bootstrap call sequence against the preserved unadmitted query certificate; state what is conditional before designing any source change. Owner role: Compiler/binding and source-owner proof reviewer. Also tracked under 90-3; same obligation.
- Inherited completion criterion: Discharge the exact omitted target initializer calls, wrapper invocation history, bootstrap reachability, cycles, reentry and failure behavior at target 12132/current 12137. Admit the existing conditional certificate only with its exact assumptions, or achieve strict fidelity. Close together with 90-8.03; local closure does not close 90-9.

### 90-8.R083 — 90-8.59 Forked-agent permission overlay and query helpers (src/utils/forkedAgent.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 80; target [12155, 12156]; candidate [12160, 12161]; target-minus-candidate nodes: -2.
- Source: `src/utils/forkedAgent.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 12155. Current statements: 12160. Diagnose the complete forkedAgent owner, property evaluation and callable interfaces. This row shares the complete closure criterion with the other rows in 90-8.59. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.03.
- Inherited completion criterion: Resolve permission-context overlay, forked query helper/logging/constant differences and their shared state/capture graph. Close together with 90-8.59; local closure does not close 90-9.

### 90-8.R084 — 90-8.59 Forked-agent permission overlay and query helpers (src/utils/forkedAgent.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 81; target [12159, 12162]; candidate [12164, 12167]; target-minus-candidate nodes: 38.
- Source: `src/utils/forkedAgent.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 12159, 12160, 12161. Current statements: 12164, 12165, 12166. Diagnose the complete forkedAgent owner, property evaluation and callable interfaces. This row shares the complete closure criterion with the other rows in 90-8.59. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.03.
- Inherited completion criterion: Resolve permission-context overlay, forked query helper/logging/constant differences and their shared state/capture graph. Close together with 90-8.59; local closure does not close 90-9.

### 90-8.R085 — 90-8.60 Compaction prompt helper interface (src/services/compact/prompt.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 82; target [12173, 12174]; candidate [12178, 12179]; target-minus-candidate nodes: 1.
- Source: `src/services/compact/prompt.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 12173. Current statements: 12178. Trace complete helper use before removing or restoring the parameter. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the extra target parameter with all callers, unusedness, function length/name/reflection and prompt output contracts. Close together with 90-8.60; local closure does not close 90-9.

### 90-8.R086 — 90-8.61 Compaction functions, retry and initializer (src/services/compact/compact.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 83; target [12183, 12185]; candidate [12188, 12190]; target-minus-candidate nodes: 8.
- Source: `src/services/compact/compact.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12183, 12184. Current statements: 12188, 12189. Prepare a complete compact.ts package covering all four residual statements and dependencies. This row shares the complete closure criterion with the other rows in 90-8.61. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.60.
- Inherited completion criterion: Close both complete compaction functions, changed optional arguments/control sites, retry statements and omitted initializer call with state/failure/provider behavior. Close together with 90-8.61; local closure does not close 90-9.

### 90-8.R087 — 90-8.61 Compaction functions, retry and initializer (src/services/compact/compact.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 84; target [12187, 12188]; candidate [12192, 12193]; target-minus-candidate nodes: -3.
- Source: `src/services/compact/compact.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12187. Current statements: 12192. Prepare a complete compact.ts package covering all four residual statements and dependencies. This row shares the complete closure criterion with the other rows in 90-8.61. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.60.
- Inherited completion criterion: Close both complete compaction functions, changed optional arguments/control sites, retry statements and omitted initializer call with state/failure/provider behavior. Close together with 90-8.61; local closure does not close 90-9.

### 90-8.R088 — 90-8.61 Compaction functions, retry and initializer (src/services/compact/compact.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 85; target [12197, 12198]; candidate [12202, 12203]; target-minus-candidate nodes: 3.
- Source: `src/services/compact/compact.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12197. Current statements: 12202. Prepare a complete compact.ts package covering all four residual statements and dependencies. This row shares the complete closure criterion with the other rows in 90-8.61. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.60.
- Inherited completion criterion: Close both complete compaction functions, changed optional arguments/control sites, retry statements and omitted initializer call with state/failure/provider behavior. Close together with 90-8.61; local closure does not close 90-9.

### 90-8.R089 — 90-8.62 Session-memory compaction helpers (src/services/compact/sessionMemoryCompact.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 86; target [12223, 12225]; candidate [12228, 12230]; target-minus-candidate nodes: 3.
- Source: `src/services/compact/sessionMemoryCompact.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 12223, 12224. Current statements: 12228, 12229. Trace sessionMemoryCompact interfaces and all invocation arguments. Owner role: Compiler/binding and source-owner proof reviewer. Depends on 90-8.61.
- Inherited completion criterion: Resolve exact last-element syntax and removed parameters across both complete helpers, callers and intrinsic/input domains. Close together with 90-8.62; local closure does not close 90-9.

### 90-8.R090 — 90-8.63 Auto-compaction call argument (src/services/compact/autoCompact.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 87; target [12235, 12236]; candidate [12240, 12241]; target-minus-candidate nodes: 2.
- Source: `src/services/compact/autoCompact.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12235. Current statements: 12240. Ground the exact autoCompact caller/callee pair. Owner role: Compiler/binding and source-owner proof reviewer. Depends on 90-8.61.
- Inherited completion criterion: Establish the semantic/reflective contract for the differing callee argument, including the removed boolean and actual callee behavior. Close together with 90-8.63; local closure does not close 90-9.

### 90-8.R091 — 90-8.64 Memory-selection prompt literal (src/memdir/findRelevantMemories.ts)

- Status: blocked-independent-source-provenance; historical: not yet diagnosed.
- Window: 88; target [12378, 12379]; candidate [12383, 12384]; target-minus-candidate nodes: 0.
- Source: `src/memdir/findRelevantMemories.ts` (identical-to-verified-89)
- Next: Obtain independently authenticated .90 source/version-delta evidence for the missing 432-character prompt paragraph. Verified .89 and current .90 sources both omit it; do not transplant comparison-target text into build inputs.
- Inherited completion criterion: Reconcile the full findRelevantMemories literal against intended behavior and concrete consumers, preserving exact original text. Close together with 90-8.64; local closure does not close 90-9.

### 90-8.R092 — 90-8.65 Attachment selection and token-usage interface (src/utils/attachments.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 89; target [12383, 12384]; candidate [12388, 12389]; target-minus-candidate nodes: 6.
- Source: `src/utils/attachments.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12383. Current statements: 12388. Diagnose both complete functions and their shared attachment/token providers. This row shares the complete closure criterion with the other rows in 90-8.65. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Close the complete attachment-selection body and token-usage helper argument/parameter removal, captures and callers. Close together with 90-8.65; local closure does not close 90-9.

### 90-8.R093 — 90-8.65 Attachment selection and token-usage interface (src/utils/attachments.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 90; target [12445, 12446]; candidate [12450, 12451]; target-minus-candidate nodes: 2.
- Source: `src/utils/attachments.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12445. Current statements: 12450. Diagnose both complete functions and their shared attachment/token providers. This row shares the complete closure criterion with the other rows in 90-8.65. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Close the complete attachment-selection body and token-usage helper argument/parameter removal, captures and callers. Close together with 90-8.65; local closure does not close 90-9.

### 90-8.R094 — 90-8.66 Tool permission callback and state (src/utils/permissions/permissions.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 91; target [12845, 12846]; candidate [12850, 12851]; target-minus-candidate nodes: 8.
- Source: `src/utils/permissions/permissions.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 12845. Current statements: 12850. Trace the complete permission owner plus concrete callbacks/state providers. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Resolve all callback/state/branch differences in the complete permissions function, callable identity, failure and reentry behavior. Close together with 90-8.66; local closure does not close 90-9.

### 90-8.R095 — 90-8.67 Permission setup exact empty spread (src/utils/permissions/permissionSetup.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 92; target [12870, 12871]; candidate [12875, 12876]; target-minus-candidate nodes: 2.
- Source: `src/utils/permissions/permissionSetup.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 12870. Current statements: 12875. Inspect complete permissionSetup provider/caller graph and build a narrowly scoped proof. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Prove this exact object/false spread site with actual value/property/getter and initialization domain; existing API/Settings certificates do not apply. Close together with 90-8.67; local closure does not close 90-9.

### 90-8.R096 — 90-8.68 Desktop handoff component callbacks (src/components/DesktopHandoff.tsx)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 93; target [13222, 13223]; candidate [13227, 13228]; target-minus-candidate nodes: 2.
- Source: `src/components/DesktopHandoff.tsx` (changed-from-verified-89)
- Next: Trial 68 target statements: 13222. Current statements: 13227. Diagnose the mapped DesktopHandoff owner and all affected event paths. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Close all complete component callback/output differences, captures, UI state and concrete provider contract. Close together with 90-8.68; local closure does not close 90-9.

### 90-8.R097 — 90-8.69 Compaction command handler and initializer (src/commands/compact/compact.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 94; target [13243, 13245]; candidate [13248, 13250]; target-minus-candidate nodes: 7.
- Source: `src/commands/compact/compact.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 13243, 13244. Current statements: 13248, 13249. Review the command against the concrete compaction interface. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.61.
- Inherited completion criterion: Resolve complete command handler and initialization with argument/return/provider order, failure and retry contracts. Close together with 90-8.69; local closure does not close 90-9.

### 90-8.R098 — 90-8.70 Plugin-management component and initializer (src/commands/plugin/ManagePlugins.tsx)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 95; target [13976, 13977]; candidate [13981, 13982]; target-minus-candidate nodes: 28.
- Source: `src/commands/plugin/ManagePlugins.tsx` (changed-from-verified-89)
- Next: Trial 68 target statements: 13976. Current statements: 13981. Diagnose full component and initializer together, keeping the large original function failure literal. This row shares the complete closure criterion with the other rows in 90-8.70. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Reconcile the complete ManagePlugins branches/memo behavior and dependency order, with callback/capture/provider identity. Close together with 90-8.70; local closure does not close 90-9.

### 90-8.R099 — 90-8.70 Plugin-management component and initializer (src/commands/plugin/ManagePlugins.tsx)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 96; target [13978, 13979]; candidate [13983, 13984]; target-minus-candidate nodes: 3.
- Source: `src/commands/plugin/ManagePlugins.tsx` (changed-from-verified-89)
- Next: Trial 68 target statements: 13978. Current statements: 13983. Diagnose full component and initializer together, keeping the large original function failure literal. This row shares the complete closure criterion with the other rows in 90-8.70. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Reconcile the complete ManagePlugins branches/memo behavior and dependency order, with callback/capture/provider identity. Close together with 90-8.70; local closure does not close 90-9.

### 90-8.R100 — 90-8.71 Powerup demo rendering initializer (src/commands/powerup/demos.tsx)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 97; target [14121, 14122]; candidate [14126, 14127]; target-minus-candidate nodes: 3.
- Source: `src/commands/powerup/demos.tsx` (new-in-90)
- Next: Trial 68 target statements: 14121. Current statements: 14126. Trace the complete initializer and concrete rendering suppliers. This is not useVirtualScroll. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close the exact demos.tsx markdown/rendering dependency list and initialization effects. Close together with 90-8.71; local closure does not close 90-9.

### 90-8.R101 — 90-8.02 Virtual scroll state, measurements and callbacks (src/hooks/useVirtualScroll.ts)

- Status: bounded-structural-repair; strict-and-package-closure-open; historical: proof needed.
- Window: None; target [14335, 14336]; candidate [14340, 14341]; target-minus-candidate nodes: 0.
- Source: `src/hooks/useVirtualScroll.ts` (changed-from-verified-89)
- Next: Preserve the verified source repair; rebind complete owner/capture evidence to the final build and resolve strict naming, provider and package obligations. Do not repeat the source repair.
- Inherited completion criterion: Establish the full hook state machine and FullscreenLayout/Scrollable contract: scrollRef identity, pending delta, sticky/clamp state, measurement cache, callback dependencies and React timing. Resolve the full hook40-node difference and exact Scrollable conditional/spread site. Close together with 90-8.02; local closure does not close 90-9.

### 90-8.R102 — 90-8.02 Virtual scroll state, measurements and callbacks (src/components/FullscreenLayout.tsx)

- Status: bounded-structural-repair; strict-and-package-closure-open; historical: proof needed.
- Window: None; target [14350, 14351]; candidate [14355, 14356]; target-minus-candidate nodes: 0.
- Source: `src/components/FullscreenLayout.tsx` (identical-to-verified-89)
- Next: Preserve the verified source repair; rebind complete owner/capture evidence to the final build and resolve strict naming, provider and package obligations. Do not repeat the source repair.
- Inherited completion criterion: Establish the full hook state machine and FullscreenLayout/Scrollable contract: scrollRef identity, pending delta, sticky/clamp state, measurement cache, callback dependencies and React timing. Resolve the full hook40-node difference and exact Scrollable conditional/spread site. Close together with 90-8.02; local closure does not close 90-9.

### 90-8.R103 — 90-8.19 Ultraplan exact initializer grouping (src/commands/ultraplan.tsx)

- Status: shape-diagnostic-gap-open; historical: acceptance-domain decision.
- Window: 98; target [14519, 14520]; candidate [14524, 14525]; target-minus-candidate nodes: 2.
- Source: `src/commands/ultraplan.tsx` (changed-from-verified-89)
- Next: Trial 68 target statements: 14519. Current statements: 14524. Reuse the authenticated complete Trial 68 witness correspondence and literal original qualifiers; decide the bounded acceptance obligation without replaying the compiler or applying a general normalization. Owner role: Acceptance owner with independent proof reviewer.
- Inherited completion criterion: For the original twelve-call/four-assignment grouping, complete core declarations and selected witness graph, retaining raw117/115 initializer failure and the separately grounded Trial 66 RemoteAgentTask provider, record the exact accepted proof scope and discharge or explicitly retain its original assumptions under the chosen acceptance criterion. Conditional transfer alone does not close strict AST or whole acceptance. Close together with 90-8.19; local closure does not close 90-9.

### 90-8.R104 — 90-8.72 Background task-management component (src/components/tasks/BackgroundTasksDialog.tsx)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 99; target [14580, 14581]; candidate [14585, 14586]; target-minus-candidate nodes: -5.
- Source: `src/components/tasks/BackgroundTasksDialog.tsx` (changed-from-verified-89)
- Next: Trial 68 target statements: 14580. Current statements: 14585. Diagnose all remaining full-function fields without reopening already repaired local scopes. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Close the complete BackgroundTasksDialog body differences beyond scoped repairs, with state/callback/provider identity. Close together with 90-8.72; local closure does not close 90-9.

### 90-8.R105 — 90-8.73 Companion observer initializer (src/buddy/observer.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 100; target [15448, 15449]; candidate [15453, 15454]; target-minus-candidate nodes: 1.
- Source: `src/buddy/observer.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 15448. Current statements: 15453. Trace the complete observer initializer; retain the original raw failure until closed. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Discharge the exact inherited43/42 initializer failure and concrete dependency effects. Close together with 90-8.73; local closure does not close 90-9.

### 90-8.R106 — 90-8.74 Companion soul schema initializer (src/buddy/soul.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 101; target [15453, 15454]; candidate [15458, 15459]; target-minus-candidate nodes: 1.
- Source: `src/buddy/soul.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 15453. Current statements: 15458. Inspect the full soul initializer and constructor values. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the exact spread/constructor difference and actual schema/provider/export contract. Close together with 90-8.74; local closure does not close 90-9.

### 90-8.R107 — 90-8.75 Companion hatch state assignments (src/commands/buddy/BuddyHatch.tsx)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 102; target [15473, 15474]; candidate [15478, 15479]; target-minus-candidate nodes: 0.
- Source: `src/commands/buddy/BuddyHatch.tsx` (changed-from-verified-89)
- Next: Trial 68 target statements: 15473. Current statements: 15478. Trace each state assignment and concrete initializer/provider order. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Prove the exact reordered assignments preserve all state and side-effect observations in BuddyHatch. Close together with 90-8.75; local closure does not close 90-9.

### 90-8.R108 — 90-8.76 Companion command configuration (src/commands/buddy/index.tsx)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 103; target [15480, 15481]; candidate [15485, 15486]; target-minus-candidate nodes: 20.
- Source: `src/commands/buddy/index.tsx` (identical-to-verified-89)
- Next: Trial 68 target statements: 15480. Current statements: 15485. Diagnose the full buddy command owner before a coherent source repair. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.74, 90-8.75.
- Inherited completion criterion: Reconcile the complete companion initialization/configuration body and all state/provider effects. Close together with 90-8.76; local closure does not close 90-9.

### 90-8.R109 — 90-8.77 Session-storage no-op and metadata placement (src/utils/sessionStorage.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 104; target [15563, 15563]; candidate [15568, 15569]; target-minus-candidate nodes: -4.
- Source: `src/utils/sessionStorage.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 15568. Trace the complete sessionStorage owner, no-op escape routes and metadata caller graph. This row shares the complete closure criterion with the other rows in 90-8.77. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the current-only no-op export/call identity and both metadata-reader movement sides, target 15656/current 15657, against exact source, consumers and initialization. Close together with 90-8.77; local closure does not close 90-9.

### 90-8.R110 — 90-8.77 Session-storage no-op and metadata placement (src/utils/sessionStorage.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 105; target [15651, 15651]; candidate [15657, 15658]; target-minus-candidate nodes: -158.
- Source: `src/utils/sessionStorage.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 15657. Trace the complete sessionStorage owner, no-op escape routes and metadata caller graph. This row shares the complete closure criterion with the other rows in 90-8.77. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the current-only no-op export/call identity and both metadata-reader movement sides, target 15656/current 15657, against exact source, consumers and initialization. Close together with 90-8.77; local closure does not close 90-9.

### 90-8.R111 — 90-8.77 Session-storage no-op and metadata placement (paired placement/source scope)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 106; target [15656, 15657]; candidate [15663, 15663]; target-minus-candidate nodes: 158.
- Source: Unmapped or target-only; do not invent an owner.
- Next: Trial 68 target statements: 15656. Current statements: none (target-only deletion). Trace the complete sessionStorage owner, no-op escape routes and metadata caller graph. This row shares the complete closure criterion with the other rows in 90-8.77. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve the current-only no-op export/call identity and both metadata-reader movement sides, target 15656/current 15657, against exact source, consumers and initialization. Close together with 90-8.77; local closure does not close 90-9.

### 90-8.R112 — 90-8.24 Disk-output private bindings (src/utils/task/diskOutput.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 107; target [15741, 15742]; candidate [15747, 15748]; target-minus-candidate nodes: 0.
- Source: `src/utils/task/diskOutput.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 15741. Current statements: 15747. Analyze this owner independently of TaskOutput and ShellCommand. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Establish the exact diskOutput class private binding/brand graph with unchanged public interface and initialization. Close together with 90-8.24; local closure does not close 90-9.

### 90-8.R113 — 90-8.25 ShellCommand private classes (src/utils/ShellCommand.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 108; target [15760, 15762]; candidate [15766, 15768]; target-minus-candidate nodes: 0.
- Source: `src/utils/ShellCommand.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 15760, 15761. Current statements: 15766, 15767. Review the two class bodies and their joint ownership/capture graph. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Close both complete ShellCommand classes with separate exact private-brand bijections, shared providers, public interface and initialization. Close together with 90-8.25; local closure does not close 90-9.

### 90-8.R114 — 90-8.20 Hooks exact definition-order window (src/utils/hooks.ts)

- Status: shape-diagnostic-gap-open; historical: acceptance-domain decision.
- Window: 109; target [15808, 15808]; candidate [15814, 15815]; target-minus-candidate nodes: -102.
- Source: `src/utils/hooks.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 15814. Reuse the authenticated complete Trial 68 witness correspondence and literal original qualifiers; decide the bounded acceptance obligation without replaying the compiler or applying a general normalization. This row shares the complete closure criterion with the other rows in 90-8.20. Owner role: Acceptance owner with independent proof reviewer.
- Inherited completion criterion: For the original hoisted-function window,75 complete witnesses, no interleaved executable statement and original external-capture/observation conditions, record the exact accepted proof scope and discharge or explicitly retain its original assumptions under the chosen acceptance criterion. Conditional transfer alone does not close strict AST or whole acceptance. Close together with 90-8.20; local closure does not close 90-9.

### 90-8.R115 — 90-8.20 Hooks exact definition-order window (paired placement/source scope)

- Status: shape-diagnostic-gap-open; historical: acceptance-domain decision.
- Window: 110; target [15813, 15814]; candidate [15820, 15820]; target-minus-candidate nodes: 102.
- Source: Unmapped or target-only; do not invent an owner.
- Next: Trial 68 target statements: 15813. Current statements: none (target-only deletion). Reuse the authenticated complete Trial 68 witness correspondence and literal original qualifiers; decide the bounded acceptance obligation without replaying the compiler or applying a general normalization. This row shares the complete closure criterion with the other rows in 90-8.20. Owner role: Acceptance owner with independent proof reviewer.
- Inherited completion criterion: For the original hoisted-function window,75 complete witnesses, no interleaved executable statement and original external-capture/observation conditions, record the exact accepted proof scope and discharge or explicitly retain its original assumptions under the chosen acceptance criterion. Conditional transfer alone does not close strict AST or whole acceptance. Close together with 90-8.20; local closure does not close 90-9.

### 90-8.R116 — 90-8.78 System prompt predicates, assembly and null helper (src/constants/prompts.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 111; target [15921, 15922]; candidate [15927, 15928]; target-minus-candidate nodes: 6.
- Source: `src/constants/prompts.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 15921. Current statements: 15927. Build the complete constants/prompts producer graph with tool registry consumers; do not assume the null helper is dead. This row shares the complete closure criterion with the other rows in 90-8.78. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.52.
- Inherited completion criterion: Resolve tool-presence predicate identities, all missing tool-specific assembly conditions and the target-only null-return helper interface/reachability. Close together with 90-8.78; local closure does not close 90-9.

### 90-8.R117 — 90-8.78 System prompt predicates, assembly and null helper (src/constants/prompts.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 112; target [15924, 15925]; candidate [15930, 15931]; target-minus-candidate nodes: 6.
- Source: `src/constants/prompts.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 15924. Current statements: 15930. Build the complete constants/prompts producer graph with tool registry consumers; do not assume the null helper is dead. This row shares the complete closure criterion with the other rows in 90-8.78. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.52.
- Inherited completion criterion: Resolve tool-presence predicate identities, all missing tool-specific assembly conditions and the target-only null-return helper interface/reachability. Close together with 90-8.78; local closure does not close 90-9.

### 90-8.R118 — 90-8.78 System prompt predicates, assembly and null helper (paired placement/source scope)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 113; target [15932, 15933]; candidate [15938, 15938]; target-minus-candidate nodes: 5.
- Source: Unmapped or target-only; do not invent an owner.
- Next: Trial 68 target statements: 15932. Current statements: none (target-only deletion). Build the complete constants/prompts producer graph with tool registry consumers; do not assume the null helper is dead. This row shares the complete closure criterion with the other rows in 90-8.78. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.52.
- Inherited completion criterion: Resolve tool-presence predicate identities, all missing tool-specific assembly conditions and the target-only null-return helper interface/reachability. Close together with 90-8.78; local closure does not close 90-9.

### 90-8.R119 — 90-8.79 API query and token accounting functions (src/services/api/claude.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 114; target [15981, 15983]; candidate [15986, 15988]; target-minus-candidate nodes: 1.
- Source: `src/services/api/claude.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 15981, 15982. Current statements: 15986, 15987. Diagnose the full services/api/claude.ts owner frontier and accounting/state contracts. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Close both complete API query/token-accounting bodies and all concrete provider/caller differences, without applying client spread certificates to these functions. Close together with 90-8.79; local closure does not close 90-9.

### 90-8.R120 — 90-8.80 Inbound-message image-resizer dependency (src/bridge/inboundMessages.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 115; target [16243, 16244]; candidate [16248, 16249]; target-minus-candidate nodes: -5.
- Source: `src/bridge/inboundMessages.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 16243. Current statements: 16248. Trace the concrete imageResizer initialization and inboundMessages entry paths. Owner role: Compiler/binding and source-owner proof reviewer. Depends on 90-8.36.
- Inherited completion criterion: Close the exact target 5/current 10-node initializer difference and the current imageResizer dependency effects. Retain the frozen Trial 48 failure and do not infer transitive repair. Close together with 90-8.80; local closure does not close 90-9.

### 90-8.R121 — 90-8.81 Bash permission React dependencies (src/components/permissions/BashPermissionRequest/BashPermissionRequest.tsx)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 116; target [16557, 16558]; candidate [16562, 16563]; target-minus-candidate nodes: 2.
- Source: `src/components/permissions/BashPermissionRequest/BashPermissionRequest.tsx` (changed-from-verified-89)
- Next: Trial 68 target statements: 16557. Current statements: 16562. Ground full BashPermissionRequest callback captures and lifecycle transitions. Owner role: Compiler/binding and source-owner proof reviewer. Depends on 90-8.66.
- Inherited completion criterion: Resolve both missing target captures in the exact dependency array and their callback/memo/state/React lifecycle semantics. Close together with 90-8.81; local closure does not close 90-9.

### 90-8.R122 — 90-8.82 Token-warning selector factoring (src/components/TokenWarning.tsx)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 117; target [16717, 16719]; candidate [16722, 16723]; target-minus-candidate nodes: 4.
- Source: `src/components/TokenWarning.tsx` (changed-from-verified-89)
- Next: Trial 68 target statements: 16717, 16718. Current statements: 16722. Trace complete TokenWarning selector producer and consumers; factoring is not assumed invisible. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Resolve named target versus inline current selector across caller/state, function identity, memo and observation domains. Close together with 90-8.82; local closure does not close 90-9.

### 90-8.R123 — 90-8.83 Unified suggestion score arithmetic (src/hooks/unifiedSuggestions.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 118; target [16837, 16838]; candidate [16841, 16842]; target-minus-candidate nodes: 5.
- Source: `src/hooks/unifiedSuggestions.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 16837. Current statements: 16841. Inspect unifiedSuggestions score operands and complete consumers; do not inherit the stale session-loader description. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Prove the exact MCP-resource score penalty temporary versus conditional arithmetic factoring, evaluation order, coercions and caller domain. Close together with 90-8.83; local closure does not close 90-9.

### 90-8.R124 — 90-8.01 PromptInput full body, constants and state (src/components/PromptInput/PromptInput.tsx)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 119; target [17079, 17080]; candidate [17083, 17084]; target-minus-candidate nodes: 8.
- Source: `src/components/PromptInput/PromptInput.tsx` (changed-from-verified-89)
- Next: Trial 68 target statements: 17079. Current statements: 17083. Diagnose the complete mapped PromptInput owner plus constants and direct state/callback providers as one package. Produce an exhaustive owner-level source plan before any repair; do not reopen the already passing Teams detail body. This row shares the complete closure criterion with the other rows in 90-8.01. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Close the complete target 17079/current 17083 component (7402/7394 nodes including the comparison Program wrapper), target 17082/current 17086 constants/state declaration and their shared binding/state graph. Account for the missing target count/state slot, every uncapped body difference, memo slots, callbacks and initialization; preserve already repaired hook and Teams call scopes. Close together with 90-8.01; local closure does not close 90-9.

### 90-8.R125 — 90-8.01 PromptInput full body, constants and state (src/components/PromptInput/PromptInput.tsx)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 120; target [17082, 17083]; candidate [17086, 17087]; target-minus-candidate nodes: 3.
- Source: `src/components/PromptInput/PromptInput.tsx` (changed-from-verified-89)
- Next: Trial 68 target statements: 17082. Current statements: 17086. Diagnose the complete mapped PromptInput owner plus constants and direct state/callback providers as one package. Produce an exhaustive owner-level source plan before any repair; do not reopen the already passing Teams detail body. This row shares the complete closure criterion with the other rows in 90-8.01. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Close the complete target 17079/current 17083 component (7402/7394 nodes including the comparison Program wrapper), target 17082/current 17086 constants/state declaration and their shared binding/state graph. Account for the missing target count/state slot, every uncapped body difference, memo slots, callbacks and initialization; preserve already repaired hook and Teams call scopes. Close together with 90-8.01; local closure does not close 90-9.

### 90-8.R126 — 90-8.84 Bash input dispatcher interface (src/utils/processUserInput/processBashCommand.tsx)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 121; target [17246, 17247]; candidate [17250, 17251]; target-minus-candidate nodes: -9.
- Source: `src/utils/processUserInput/processBashCommand.tsx` (identical-to-verified-89)
- Next: Trial 68 target statements: 17246. Current statements: 17250. Diagnose processBashCommand with its dispatch callers as one interface package. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Reconcile the extra current parameter and all complete processing differences with exact callers, error paths and return/output contract. Close together with 90-8.84; local closure does not close 90-9.

### 90-8.R127 — 90-8.85 REPL input processing and truncation state (src/utils/processUserInput/processUserInput.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 122; target [17250, 17252]; candidate [17254, 17257]; target-minus-candidate nodes: -55.
- Source: `src/utils/processUserInput/processUserInput.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 17250, 17251. Current statements: 17254, 17255, 17256. Join helper, constant and handlers in one owner-level graph; avoid a standalone constant patch. This row shares the complete closure criterion with the other rows in 90-8.85. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.84.
- Inherited completion criterion: Close all complete processUserInput handler/body differences, current-only output truncation helper and constant, consumers and output-domain semantics. Close together with 90-8.85; local closure does not close 90-9.

### 90-8.R128 — 90-8.85 REPL input processing and truncation state (src/utils/processUserInput/processUserInput.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 123; target [17253, 17253]; candidate [17258, 17259]; target-minus-candidate nodes: -4.
- Source: `src/utils/processUserInput/processUserInput.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: none (current-only insertion). Current statements: 17258. Join helper, constant and handlers in one owner-level graph; avoid a standalone constant patch. This row shares the complete closure criterion with the other rows in 90-8.85. Owner role: Source-owner analyst with independent actual-emission reviewer. Depends on 90-8.84.
- Inherited completion criterion: Close all complete processUserInput handler/body differences, current-only output truncation helper and constant, consumers and output-domain semantics. Close together with 90-8.85; local closure does not close 90-9.

### 90-8.R129 — 90-8.86 Skill change-detector callback receiver (src/utils/skills/skillChangeDetector.ts)

- Status: bounded-structural-repair; strict-and-package-closure-open; historical: proof needed.
- Window: None; target [17275, 17276]; candidate [17281, 17282]; target-minus-candidate nodes: 0.
- Source: `src/utils/skills/skillChangeDetector.ts` (changed-from-verified-89)
- Next: Preserve the verified source repair; rebind complete owner/capture evidence to the final build and resolve strict naming, provider and package obligations. Do not repeat the source repair.
- Inherited completion criterion: Establish exact startup/cleanup callback provider and this identity, timing and registration order. Close together with 90-8.86; local closure does not close 90-9.

### 90-8.R130 — 90-8.87 Away-summary initializer dependencies (src/services/awaySummary.ts)

- Status: shape-diagnostic-gap-open; historical: proof needed.
- Window: 124; target [17389, 17390]; candidate [17395, 17396]; target-minus-candidate nodes: -12.
- Source: `src/services/awaySummary.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 17389. Current statements: 17395. Trace all named awaySummary providers and initialization paths. Owner role: Compiler/binding and source-owner proof reviewer.
- Inherited completion criterion: Discharge each extra current initialization call and its concrete side effects/order. Close together with 90-8.87; local closure does not close 90-9.

### 90-8.R131 — 90-8.88 SDK control schema union (src/entrypoints/sdk/controlSchemas.ts)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 125; target [17435, 17436]; candidate [17441, 17442]; target-minus-candidate nodes: -4.
- Source: `src/entrypoints/sdk/controlSchemas.ts` (identical-to-verified-89)
- Next: Trial 68 target statements: 17435. Current statements: 17441. Build a complete controlSchemas union/constructor census. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Resolve every additional current constructor and complete schema/export/provider identity difference. Close together with 90-8.88; local closure does not close 90-9.

### 90-8.R132 — 90-8.89 Bundled verify-skill prompt literal (physical source owner unresolved)

- Status: shape-diagnostic-gap-open; historical: not yet diagnosed.
- Window: 126; target [17888, 17889]; candidate [17894, 17895]; target-minus-candidate nodes: 0.
- Source: Unmapped or target-only; do not invent an owner.
- Next: Trial 68 target statements: 17888. Current statements: 17894. Trace the generated prompt producer using exact bytes and callers; source ownership remains explicitly undiagnosed. Physical source attribution for the unmapped literal is still unresolved. Owner role: Source-owner analyst with independent actual-emission reviewer.
- Inherited completion criterion: Recover trustworthy source attribution for the unmapped bundled verify prompt, then reconcile its entire literal and consumer contract. Close together with 90-8.89; local closure does not close 90-9.

### 90-8.R133 — 90-8.04 Headless conditional whole-loop proof (src/cli/print.ts)

- Status: shape-diagnostic-gap-open; historical: acceptance-domain decision.
- Window: 127; target [18136, 18137]; candidate [18142, 18143]; target-minus-candidate nodes: -1.
- Source: `src/cli/print.ts` (changed-from-verified-89)
- Next: Trial 68 target statements: 18136. Current statements: 18142. Rebind the fixed original certificate to Trial 68 using complete witnesses, then discharge or explicitly approve its precise host/capture/observation conditions. Do not reopen repaired runHeadless, loader or own-initializer scopes. Owner role: Acceptance owner with independent proof reviewer. Also tracked under 90-4; same obligation.
- Inherited completion criterion: Decide and justify the exact target 18136/current 18142 whole-loop certificate, including its one declaration motion, one replay spread, all 182 initialized external capture pairs, input producers and callback/observation assumptions. Raw original-loop inequality remains visible. Close together with 90-8.04; local closure does not close 90-9.

