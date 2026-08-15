# Compiled-semantic source reproduction audit

Audit date: 2026-08-10.

## Verdict

The 21 checked-in recovery cases have three independent results:

1. **Generated artifact recovery:** every adjacent delta reconstructs the
   authenticated target `cli.js` byte-for-byte.
2. **First-party source semantics:** every changed, moved, or unresolved
   first-party target unit is either semantically recovered in `src/` or
   proven to be identifier/order-only, generated metadata, or statically
   unreachable. After the fixes in this audit, no first-party
   `source-runtime-gap` remains.
3. **Whole-bundle source semantics:** not established for any case. Embedded
   dependency runtime and the build graph are not reproducible from the
   historical source trees because they contain no root application manifest,
   dependency lock/source archive, or hermetic build configuration.

The second result is the source-reproduction criterion requested here. The
third is retained as a stricter, separately failing boundary; exact artifact
replay is not used to conceal it.

## Semantic criterion

`compiled-ast-function-semantics-v1` ignores information that compilation and
minification may erase without changing behavior:

- local and generated identifier spelling;
- independent declaration and function order;
- comments, whitespace, formatting, and erased TypeScript types.

It does not ignore observable behavior:

- strings, template values, numeric/BigInt values, RegExp patterns and flags,
  and property keys;
- operators, branches, gates, call paths, ordering within a call path, state,
  persistence, rendering, prompts, telemetry, and side effects;
- command/tool registration and reachable feature-flag or environment-gated
  code.

## Executable proof model

For every case, the audit:

1. authenticates the baseline and target bundle identities and optionally
   decodes the pinned Zstandard delta for a direct byte comparison;
2. reads the complete structural ledger and requires exactly one semantic row
   for every target unit not classified as `matched`;
3. pins each row's target index, byte range, AST node type, source hash,
   structural class, owner, evidence, and disposition;
4. treats dependency rows as whole-bundle gaps unless their exact source and
   build input are pinned—source-map attribution alone never closes them;
5. applies each `semantic-supplement.patch` only to the reachable historical
   commit where the behavior first appears and syntax-builds every changed
   TS/TSX/JS entry;
6. runs each case's semantic evidence against that materialized historical
   source tree, not against a later cumulative checkout, with authenticated
   versioned bundles supplied to the tests; and
7. proves ancestry transitively: exact structural matches carry prior
   semantics forward, while every later nonmatch must be classified again.

The cooked-literal residue scanner parses both bundles and TS/TSX source. It
normalizes escaped strings/template chunks, numeric spellings, BigInt values,
and RegExp flags, avoiding both raw-text false positives and silent non-string
literal gaps. Operator/control-flow residue is reviewed from the structural
units rather than inferred from source-file existence.

## Per-case results

<!-- FINAL_CASE_TABLE -->

`First-party` is the compiled-semantic result. `Whole bundle` remains `Gap`
when even one embedded dependency unit or required build input is unpinned.
The exact generated replay is `Pass` for every row and is omitted from the
table only to keep it readable.

## Material gaps found and fixed

The prior readable overlays were useful but not complete. The audit recovered
the omitted runtime at the first published release where it appears, including:

- deferred-tool suspension/resume, bridge and headless MCP coordination,
  session/resume filtering, prompts, plugin-path hardening, updater/worktree,
  cold-compaction, and adjacent 2.1.89 runtime;
- `/powerup`, `/toggle-memory`, the Anthropic-on-AWS provider path, verification
  prompts, interactive advisor, Bash rerun aliases, `/team-onboarding`, Bedrock
  setup/model migration/auth probes, and versioned Claude API guidance;
- subprocess scrub/sandbox/script caps, `MonitorTool`, Vertex setup, dynamic
  prompt exclusion, communication-style gates, settings notifications, Brief
  retry, unavailable-subagent guidance, and prompt heading changes;
- MCP large-output recovery, plugin monitor/schema/installer/path behavior,
  Doctor/channel/headless-MCP behavior, managed-agent documents, recap, and
  subagent status polling/rendering;
- cache-safe away summaries, dynamic loop scheduling/cancellation, provider
  setup/relaunch, structured-output model gates, table/grapheme copy behavior,
  `NO_COLOR`, MCP authentication completion, advisor/team/recap continuity,
  and the final MCP coordinator and embedded-document transitions.

Case-local coverage ledgers and tests—not this prose list—are the exhaustive
record. Later changes to the same behavior are owned by the later case rather
than copied backward into the introduction supplement.

## Remaining whole-bundle gaps

Every case records its dependency units in
`semantic/dependency-coverage.json.gz`. Those rows are not dismissed as
“vendor noise”: they remain `dependency-runtime` gaps, grouped by attributed
package/vendor source and split between identifier/metadata-equivalent churn
and material or unresolved deltas.

They cannot be honestly fixed from the available evidence by inventing a
`package.json` or guessing package versions. None of the historical target
commits contains the complete application manifest, lockfile, dependency
source archive, compiler/bundler configuration, resolver aliases, or feature
definitions needed to rebuild the embedded graph. The published bundle bytes
remain exactly recoverable through the independent generated delta.

## Verifier defects fixed during the audit

- Thirteen manifests named unreachable staging commits as `baseCommit`; they
  now name reachable recovery commits.
- Thirteen manifests used `baseGitTree` for an `src` subtree. Incremental cases
  now pin `baseCommit`, the full repository tree, and `baseSourceGitTree`, and
  the lineage verifier checks all three against an archived byte comparison.
- Historical verification previously resolved current scripts/tests from the
  old checkout. Tooling and historical source roots are now distinct.
- Semantic supplements are verified at their introduction commits instead of
  being textually forced onto later snapshots where unrelated context drift
  would create false conflicts.
- Semantic tests now run against the materialized release-local source root;
  later legitimate source evolution can no longer make an early case fail or
  make a missing early owner appear covered.
- Dependency sidecars must exactly partition the dependency rows in the
  semantic ledger and cannot assert pinned inputs that do not exist.
- The 2.1.104 → 2.1.105 skill-listing evidence was widened from an ambiguous
  identifier to a unique target fragment that binds the recovered `1536`
  value.

## Reproduction commands

Audit the complete semantic chain without reacquiring artifacts:

```sh
pixi run node recovery/scripts/audit-source-reproduction.mjs
```

Also replay every exact delta and run the release-local semantic evidence
against authenticated bundles:

```sh
pixi run node recovery/scripts/audit-source-reproduction.mjs \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Audit a selected target while still proving its full ancestry:

```sh
pixi run node recovery/scripts/audit-source-reproduction.mjs \
  --case recovery/cases/2.1.114-to-2.1.116/manifest.json \
  --artifacts "$RECOVERY_ARTIFACTS"
```

Fail unless whole-bundle source semantics—including dependencies and build
inputs—are reproducible:

```sh
pixi run node recovery/scripts/audit-source-reproduction.mjs \
  --require-exact-source
```

The last command intentionally remains nonzero until genuine dependency and
build provenance is added; byte-exact generated replay is not a substitute.
